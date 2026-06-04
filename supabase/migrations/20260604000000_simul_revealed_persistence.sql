-- ============================================================================
-- Simultaneous Board: Round-aware revealed_questions_by_round persistence
-- ============================================================================
-- Previously arena_state.revealedQuestions was a flat JSON array. Now replaced
-- with revealed_questions_by_round = { "1": [...] } matching GameBoardV2's
-- round-aware structure. Simultaneous mode uses round 1 as the only round.
--
-- This ensures tiles survive page refresh AND the postgres_changes →
-- onLobbyChange path doesn't overwrite client-side optimistic/broadcast state.
-- ============================================================================

-- ── 1. Fix start_simultaneous_session ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_simultaneous_session(
    p_lobby_code TEXT,
    p_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_players UUID[];
    v_first_picker UUID;
    v_existing_state JSONB;
BEGIN
    SELECT array_agg(id ORDER BY random()) INTO v_players
    FROM public.players
    WHERE lobby_code = p_lobby_code;

    IF v_players IS NULL OR array_length(v_players, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No active players found');
    END IF;

    v_first_picker := v_players[1];

    SELECT arena_state INTO v_existing_state
    FROM public.lobbies WHERE code = p_lobby_code;

    IF v_existing_state IS NOT NULL AND v_existing_state->>'phase' IS NOT NULL
       AND v_existing_state->>'phase' NOT IN ('GAME_OVER') THEN
        RETURN json_build_object(
            'success', true,
            'status', 'PLAYING',
            'pickerId', v_existing_state->>'pickerId',
            'resumed', true
        );
    END IF;

    UPDATE public.lobbies
    SET
        status = 'PLAYING',
        settings = COALESCE(settings, '{}'::jsonb) || p_settings,
        arena_state = jsonb_build_object(
            'phase', 'PICKING',
            'pickerId', v_first_picker,
            'lastPickerId', v_first_picker,
            'activeQuestion', null,
            -- Round-aware: round 1 is the only round in simultaneous mode
            'revealed_questions_by_round', jsonb_build_object('1', '[]'::jsonb),
            'timerEndTime', null,
            'scoringType', COALESCE(p_settings->>'scoringType', 'RELATIVE'),
            'penaltyType', COALESCE(p_settings->>'penaltyType', 'HALF')
        )
    WHERE code = p_lobby_code;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lobby not found');
    END IF;

    RETURN json_build_object(
        'success', true,
        'status', 'PLAYING',
        'pickerId', v_first_picker
    );
END;
$$;

-- ── 2. Fix open_simultaneous_question ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.open_simultaneous_question(
    p_lobby_code TEXT,
    p_question_data JSONB,
    p_timer_seconds INTEGER DEFAULT 15
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_server_time BIGINT;
    v_timer_end DOUBLE PRECISION;
    v_q_id TEXT;
    v_existing_arr JSONB;
    v_new_by_round JSONB;
    v_arena_state JSONB;
BEGIN
    v_server_time := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    v_timer_end := EXTRACT(EPOCH FROM NOW()) + p_timer_seconds;
    v_q_id := p_question_data->>'id';

    -- Fetch current arena_state for legacy migration path
    SELECT arena_state INTO v_arena_state
    FROM public.lobbies WHERE code = p_lobby_code;

    -- Force server-side startTime
    p_question_data := jsonb_set(
        p_question_data,
        '{questionStartTime}',
        to_jsonb(v_server_time)
    );

    -- Round-aware: append to revealed_questions_by_round -> 1
    -- With legacy fallback: if revealedQuestions exists (old games), migrate it
    v_existing_arr := COALESCE(
        v_arena_state->'revealed_questions_by_round'->'1',
        v_arena_state->'revealedQuestions',
        '[]'::jsonb
    );
    v_new_by_round := jsonb_build_object('1', v_existing_arr || to_jsonb(v_q_id));

    UPDATE public.lobbies
    SET arena_state = jsonb_set(
        jsonb_set(
            jsonb_set(
                jsonb_set(
                    COALESCE(arena_state, '{}'::jsonb),
                    '{phase}', '"OPEN"'
                ),
                '{activeQuestion}', p_question_data
            ),
            '{timerEndTime}', to_jsonb(v_timer_end)
        ),
        '{revealed_questions_by_round}', v_new_by_round
    )
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'PICKING';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Cannot open question — not in PICKING phase');
    END IF;

    RETURN json_build_object('success', true, 'timerEndTime', v_timer_end);
END;
$$;

-- ── 3. Fix next_simultaneous_turn ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.next_simultaneous_turn(
    p_lobby_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_arena_state JSONB;
    v_last_picker_id UUID;
    v_question_id TEXT;
    v_next_picker_id UUID;
    v_is_active BOOLEAN;
    v_fallback_picker UUID;
    v_existing_arr JSONB;
    v_new_by_round JSONB;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM public.lobbies WHERE code = p_lobby_code;

    v_last_picker_id := (v_arena_state->>'lastPickerId')::UUID;
    v_question_id := v_arena_state->'activeQuestion'->>'id';

    SELECT player_id INTO v_next_picker_id
    FROM public.simultaneous_answers
    WHERE lobby_code = p_lobby_code
      AND question_id = v_question_id
      AND is_correct = true
      AND rank = 1
    LIMIT 1;

    IF v_next_picker_id IS NULL THEN
        v_next_picker_id := v_last_picker_id;
    END IF;

    -- Verify next picker exists (no heartbeat filter)
    SELECT EXISTS(
        SELECT 1 FROM public.players
        WHERE id = v_next_picker_id
          AND lobby_code = p_lobby_code
    ) INTO v_is_active;

    IF NOT v_is_active THEN
        SELECT id INTO v_fallback_picker
        FROM public.players
        WHERE lobby_code = p_lobby_code
        ORDER BY random() LIMIT 1;

        IF v_fallback_picker IS NOT NULL THEN
            v_next_picker_id := v_fallback_picker;
        END IF;
    END IF;

    -- Round-aware: append to revealed_questions_by_round -> 1
    -- With legacy fallback: if revealedQuestions exists (old games), migrate it
    v_existing_arr := COALESCE(
        v_arena_state->'revealed_questions_by_round'->'1',
        v_arena_state->'revealedQuestions',
        '[]'::jsonb
    );
    v_new_by_round := jsonb_build_object('1', v_existing_arr || to_jsonb(v_question_id));

    UPDATE public.lobbies
    SET arena_state = (CASE
        WHEN arena_state IS NULL THEN '{}'::jsonb
        ELSE arena_state
    END)
    || jsonb_build_object(
        'phase', 'PICKING',
        'pickerId', v_next_picker_id,
        'lastPickerId', v_next_picker_id,
        'activeQuestion', null,
        'revealed_questions_by_round', v_new_by_round,
        'timerEndTime', null
    )
    WHERE code = p_lobby_code;

    RETURN json_build_object(
        'success', true,
        'nextPickerId', v_next_picker_id,
        'hadWinner', (v_next_picker_id != v_last_picker_id OR v_next_picker_id IS NULL)
    );
END;
$$;
