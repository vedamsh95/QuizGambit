-- ============================================================================
-- Fix: Play Again leaks old answers + early game-over + stale state
-- ============================================================================
--
-- BUG #3 (Play Again leaks old answers):
--   1. reset_lobby_for_new_game didn't clear draftPicks (top-level key, not
--      nested under 'draft') — same categories selected on replay → same Q IDs.
--   2. simultaneous_answers table NEVER cleared — old answers survived with
--      ON CONFLICT DO NOTHING, so new answers were silently rejected.
--   3. start_simultaneous_session didn't clear simultaneous_answers either.
--
-- BUG #2 (Early game-over at ~15 questions):
--   open_simultaneous_question appends to revealed_questions_by_round ("1")
--   AND next_simultaneous_turn ALSO appends. Each question appears TWICE →
--   revealed count inflates → game-over fires at ~12-15 questions not 25.
--   Fix: only open_simultaneous_question appends; next_simultaneous_turn
--   preserves the existing revealed state without re-adding.
--
-- BUG #1 (Sync lag):
--   force_close_simultaneous_question still uses old flat revealedQuestions
--   format. After force-close + page refresh, revealed state is lost because
--   the client reads revealed_questions_by_round not revealedQuestions.
--   Fix: force_close now uses revealed_questions_by_round format consistently.
-- ============================================================================

-- ── 1. Fix reset_lobby_for_new_game: clear draftPicks + simultaneous_answers ─

CREATE OR REPLACE FUNCTION reset_lobby_for_new_game(
  p_lobby_code text
) RETURNS void AS $$
BEGIN
  -- Nuke all answers from previous game (BUG #3: old answers leaked via ON CONFLICT DO NOTHING)
  DELETE FROM simultaneous_answers WHERE lobby_code = p_lobby_code;

  UPDATE lobbies
  SET
    status = 'LOBBY',
    buzzed_player_id = NULL,
    current_question_id = NULL,
    -- Clear ALL game-specific settings including draftPicks (top-level key, not under 'draft')
    settings = COALESCE(settings, '{}'::jsonb) - 'round_categories'
                                            - 'draft'
                                            - 'draftPicks'
                                            - 'revealed_questions'
                                            - 'revealed_questions_by_round'
                                            - 'simultaneous_categories',
    -- Nuke stale arena_state so start_* RPCs don't "resume" old games
    arena_state = NULL
  WHERE code = p_lobby_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 2. Fix start_simultaneous_session: clear old answers on new game ────────

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

    -- Nuke old answers from previous game (BUG #3: ON CONFLICT DO NOTHING blocks new answers)
    DELETE FROM simultaneous_answers WHERE lobby_code = p_lobby_code;

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

-- ── 3. Fix next_simultaneous_turn: DON'T re-append revealed question ────────
--    open_simultaneous_question already appends when the tile is clicked.
--    Re-appending here causes duplicates → inflated count → early game-over.

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

    -- BUG FIX #2: Don't re-append revealed question — it was already appended
    -- in open_simultaneous_question. Preserve existing revealed_questions_by_round.
    -- The || operator merges JSONB objects, so revealed_questions_by_round from
    -- the existing arena_state is preserved (|| only overwrites top-level keys
    -- present in the right-hand object).
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

-- ── 4. Fix force_close_simultaneous_question: use revealed_questions_by_round ─
--    Previously used flat revealedQuestions; after page refresh the client reads
--    revealed_questions_by_round and would see the tile as unrevealed.

CREATE OR REPLACE FUNCTION public.force_close_simultaneous_question(
    p_lobby_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_active_q JSONB;
    v_question_id TEXT;
    v_question_points INTEGER;
    v_penalty_type TEXT;
    v_player RECORD;
    v_penalty INTEGER;
    v_inserted_count INTEGER := 0;
    v_existing_arr JSONB;
    v_new_by_round JSONB;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM public.lobbies WHERE code = p_lobby_code;

    v_active_q := v_arena_state->'activeQuestion';

    IF v_active_q IS NULL OR (v_active_q->>'id') IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active question');
    END IF;

    IF (v_arena_state->>'phase') != 'OPEN' THEN
        RETURN json_build_object('success', false, 'error', 'Question already closed');
    END IF;

    v_question_id := v_active_q->>'id';
    v_question_points := COALESCE((v_active_q->>'points')::INTEGER, 100);
    v_penalty_type := COALESCE(v_arena_state->>'penaltyType', 'HALF');

    IF v_penalty_type = 'FULL' THEN v_penalty := -v_question_points;
    ELSE v_penalty := -FLOOR(v_question_points * 0.50);
    END IF;

    -- All players (no heartbeat filter)
    FOR v_player IN
        SELECT p.id, p.name
        FROM public.players p
        WHERE p.lobby_code = p_lobby_code
          AND NOT EXISTS (
              SELECT 1 FROM public.simultaneous_answers a
              WHERE a.lobby_code = p_lobby_code
                AND a.question_id = v_question_id
                AND a.player_id = p.id
          )
    LOOP
        INSERT INTO public.simultaneous_answers (
            lobby_code, question_id, player_id, player_name,
            answer_text, is_correct, answer_time_ms, rank, points_awarded
        ) VALUES (
            p_lobby_code, v_question_id, v_player.id, v_player.name,
            '[TIMEOUT]', false, 99999, NULL, v_penalty
        )
        ON CONFLICT ON CONSTRAINT unique_simultaneous_answer DO NOTHING;

        UPDATE public.players
        SET score = COALESCE(score, 0) + v_penalty
        WHERE id = v_player.id;

        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    -- Round-aware: append to revealed_questions_by_round -> 1
    -- With legacy fallback: if revealedQuestions exists (old games), migrate it
    v_existing_arr := COALESCE(
        v_arena_state->'revealed_questions_by_round'->'1',
        v_arena_state->'revealedQuestions',
        '[]'::jsonb
    );
    v_new_by_round := jsonb_build_object('1', v_existing_arr || to_jsonb(v_question_id));

    UPDATE public.lobbies
    SET arena_state = (jsonb_set(
        COALESCE(arena_state, '{}'::jsonb),
        '{revealed_questions_by_round}', v_new_by_round
    )) || jsonb_build_object('phase', 'RESULTS')
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'OPEN';

    RETURN json_build_object(
        'success', true,
        'timeout_players', v_inserted_count
    );
END;
$$;
