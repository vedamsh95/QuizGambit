```
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. User Profiles
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique,
  is_admin boolean default false,
  storage_preference text default 'local', -- 'local' or 'cloud'
  created_at timestamptz default now()
);

-- 2. Lobbies Table
-- 13. [UPDATE] Add 'SELECTING' to lobby_status (Run this manually if type exists)
-- ALTER TYPE lobby_status ADD VALUE IF NOT EXISTS 'SELECTING';
-- Re-defining for initial setup:
create type lobby_status as enum ('LOBBY', 'SELECTING', 'READING', 'BUZZING', 'ANSWERING', 'GAME_OVER');

create table public.lobbies (
  code text primary key,
  host_id uuid references auth.users(id) not null,
  status lobby_status default 'LOBBY',
  current_question_id uuid,
  buzzed_player_id uuid,
  settings jsonb default '{"rounds": 5, "timer": 15, "has_buzzer": true}'::jsonb,
  created_at timestamptz default now()
);

-- ... (skipping unchanged tables) ...

-- PLAYERS POLICIES
create policy "Anyone can join" on public.players for insert with check (true);
create policy "Everyone can view players" on public.players for select using (true);
create policy "Players can update themselves" on public.players for update using (true);

-- BUZZER LOCK FUNCTION
create or replace function public.buzz_in(
  p_lobby_code text,
  p_player_id uuid
) returns boolean as $$
declare
  v_status lobby_status;
  v_buzzed_id uuid;
begin
  select status, buzzed_player_id into v_status, v_buzzed_id
  from public.lobbies
  where code = p_lobby_code;

  if v_status = 'BUZZING' and v_buzzed_id is null then
    update public.lobbies
    set buzzed_player_id = p_player_id,
      status = 'ANSWERING'
    where code = p_lobby_code;
    return true;
  else
    return false;
  end if;
end;
$$ language plpgsql security definer;

-- Trigger for profile creation on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
