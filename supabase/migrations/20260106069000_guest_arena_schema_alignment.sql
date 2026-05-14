-- Guest Arena schema alignment
-- Keeps Arena hosting guest-friendly by allowing non-auth UUID host_id values,
-- aligns lobby status/state columns with Arena RPC/frontend expectations,
-- and adds a guest-safe leave_game RPC.

create extension if not exists "uuid-ossp";

-- Ensure lobby_status has Arena terminal/running states when the enum exists.
do $$
begin
  if to_regtype('public.lobby_status') is not null then
    if not exists (
      select 1
      from pg_enum
      where enumtypid = 'public.lobby_status'::regtype
        and enumlabel = 'PLAYING'
    ) then
      alter type public.lobby_status add value 'PLAYING';
    end if;

    if not exists (
      select 1
      from pg_enum
      where enumtypid = 'public.lobby_status'::regtype
        and enumlabel = 'FINISHED'
    ) then
      alter type public.lobby_status add value 'FINISHED';
    end if;
  end if;
end
$$;

-- Align lobbies for guest Arena hosting and Arena state.
do $$
declare
  r record;
begin
  if to_regclass('public.lobbies') is not null then
    -- Drop any FK from lobbies.host_id to auth.users so random guest UUIDs work.
    for r in
      select c.conname
      from pg_constraint c
      join pg_class tbl on tbl.oid = c.conrelid
      join pg_namespace nsp on nsp.oid = tbl.relnamespace
      join pg_class ref_tbl on ref_tbl.oid = c.confrelid
      join pg_namespace ref_nsp on ref_nsp.oid = ref_tbl.relnamespace
      where c.contype = 'f'
        and nsp.nspname = 'public'
        and tbl.relname = 'lobbies'
        and ref_nsp.nspname = 'auth'
        and ref_tbl.relname = 'users'
        and exists (
          select 1
          from unnest(c.conkey) as key(attnum)
          join pg_attribute a
            on a.attrelid = c.conrelid
           and a.attnum = key.attnum
          where a.attname = 'host_id'
        )
    loop
      execute format('alter table public.lobbies drop constraint if exists %I', r.conname);
    end loop;

    -- Preserve uuid not null semantics for host_id.
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'lobbies'
        and column_name = 'host_id'
        and udt_name = 'uuid'
    ) then
      update public.lobbies
      set host_id = uuid_generate_v4()
      where host_id is null;

      alter table public.lobbies
        alter column host_id set not null;
    end if;

    alter table public.lobbies
      add column if not exists mode text default 'STANDARD';

    alter table public.lobbies
      alter column mode set default 'STANDARD';

    update public.lobbies
    set mode = 'STANDARD'
    where mode is null;

    alter table public.lobbies
      add column if not exists arena_state jsonb;
  end if;
end
$$;

-- Align players for Arena heartbeat/state/scoring expectations.
do $$
begin
  if to_regclass('public.players') is not null then
    alter table public.players
      add column if not exists last_seen timestamptz default now();

    alter table public.players
      alter column last_seen set default now();

    update public.players
    set last_seen = now()
    where last_seen is null;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'players'
        and column_name = 'metadata'
    ) then
      alter table public.players
        add column metadata jsonb default '{}'::jsonb;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'players'
        and column_name = 'metadata'
        and udt_name = 'jsonb'
    ) then
      alter table public.players
        alter column metadata set default '{}'::jsonb;

      update public.players
      set metadata = '{}'::jsonb
      where metadata is null;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'players'
        and column_name = 'score'
    ) then
      alter table public.players
        add column score integer default 0;
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'players'
        and column_name = 'score'
        and data_type = 'integer'
    ) then
      alter table public.players
        alter column score set default 0;

      update public.players
      set score = 0
      where score is null;
    end if;

    execute 'create index if not exists idx_players_last_seen on public.players(last_seen)';
    execute 'create index if not exists idx_players_lobby_last_seen on public.players(lobby_code, last_seen)';
  end if;
end
$$;

drop function if exists public.leave_game(text, uuid);

create function public.leave_game(
  p_lobby_code text,
  p_player_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_arena_state jsonb;
  v_new_state jsonb;
  v_deleted_count integer := 0;
  v_remaining_count integer := 0;
  v_was_picker boolean := false;
  v_next_picker uuid;
  v_active_question_id text;
  v_answer_count integer := 0;
begin
  select l.arena_state
    into v_arena_state
  from public.lobbies l
  where l.code = p_lobby_code
  for update;

  if not found then
    return json_build_object(
      'success', false,
      'error', 'Lobby not found'
    );
  end if;

  v_new_state := coalesce(v_arena_state, '{}'::jsonb);
  v_was_picker := coalesce(v_new_state->>'pickerId', '') = p_player_id::text;
  v_active_question_id := v_new_state->'activeQuestion'->>'id';

  delete from public.players
  where lobby_code = p_lobby_code
    and id = p_player_id;

  get diagnostics v_deleted_count = row_count;

  select count(*)
    into v_remaining_count
  from public.players
  where lobby_code = p_lobby_code;

  if v_remaining_count = 0 then
    v_new_state :=
      v_new_state
      || jsonb_build_object(
        'phase', 'FINISHED',
        'pickerId', null,
        'activeQuestion', null,
        'timerEndTime', null
      );

    begin
      update public.lobbies
      set status = 'FINISHED'::public.lobby_status,
          arena_state = v_new_state
      where code = p_lobby_code;
    exception
      when invalid_text_representation or undefined_object then
        update public.lobbies
        set arena_state = v_new_state
        where code = p_lobby_code;
    end;

    return json_build_object(
      'success', true,
      'deleted', v_deleted_count > 0,
      'remaining_players', 0,
      'lobby_finished', true
    );
  end if;

  -- If the leaving player was the current picker, choose an active replacement
  -- when possible, otherwise any remaining player.
  if v_was_picker then
    select id
      into v_next_picker
    from public.players
    where lobby_code = p_lobby_code
    order by
      case
        when last_seen > now() - interval '7 seconds' then 0
        else 1
      end,
      random()
    limit 1;

    if v_next_picker is not null then
      v_new_state := jsonb_set(
        v_new_state,
        '{pickerId}',
        to_jsonb(v_next_picker::text),
        true
      );

      if coalesce(v_new_state->>'phase', '') in ('PICKING', 'SELECTING') then
        v_new_state := jsonb_set(v_new_state, '{phase}', '"PICKING"'::jsonb, true);
      end if;
    else
      v_new_state := jsonb_set(v_new_state, '{pickerId}', 'null'::jsonb, true);
    end if;
  end if;

  -- If a player leaves during an open/answering question and all remaining
  -- players have answered, advance to RESULTS.
  if v_active_question_id is not null
     and coalesce(v_new_state->>'phase', '') in ('OPEN', 'ANSWERING') then
    if to_regclass('public.arena_answers') is not null then
      execute '
        select count(distinct aa.player_id)
        from public.arena_answers aa
        join public.players p
          on p.id = aa.player_id
         and p.lobby_code = aa.lobby_code
        where aa.lobby_code = $1
          and aa.question_id = $2
      '
      into v_answer_count
      using p_lobby_code, v_active_question_id;

      if v_answer_count >= v_remaining_count then
        v_new_state := jsonb_set(v_new_state, '{phase}', '"RESULTS"'::jsonb, true);
      end if;
    end if;
  end if;

  update public.lobbies
  set arena_state = v_new_state
  where code = p_lobby_code;

  return json_build_object(
    'success', true,
    'deleted', v_deleted_count > 0,
    'remaining_players', v_remaining_count,
    'lobby_finished', false,
    'was_picker', v_was_picker,
    'next_picker_id', v_next_picker
  );
end;
$$;

grant execute on function public.leave_game(text, uuid) to anon, authenticated;
