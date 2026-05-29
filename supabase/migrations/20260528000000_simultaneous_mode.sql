-- ============================================================================
-- Simultaneous Multiplayer Mode — 5×5 Grid Game
-- ============================================================================
-- Players answer the same question simultaneously. Scoring is based on speed:
--   - RELATIVE: 1st correct = 100%, 2nd = 75%, 3rd = 50%, 4th+ = 25% 
--   - FASTEST_FINGER: Only 1st correct gets 100%, rest get 0
--   - HALF penalty: wrong = -50% of points
--   - FULL penalty: wrong = -100% of points
--
-- Question picker rotation:
--   - First question: random player picks
--   - After: first correct answerer picks next. If all wrong, same picker continues.
-- ============================================================================

-- ── 1. Simultaneous Answers Table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.simultaneous_answers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lobby_code TEXT NOT NULL,
    question_id TEXT NOT NULL,
    player_id UUID NOT NULL,
    player_name TEXT,
    answer_text TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT false,
    answer_time_ms INTEGER DEFAULT 0,   -- client-relative ms from question open
    submission_order INTEGER,            -- sequential order of submission (across all players)
    rank INTEGER,                        -- rank among correct answers (1 = first correct, null = wrong)
    points_awarded INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One answer per player per question
    CONSTRAINT unique_simultaneous_answer 
        UNIQUE (lobby_code, question_id, player_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_simultaneous_answers_lobby_q 
    ON simultaneous_answers(lobby_code, question_id);

CREATE INDEX IF NOT EXISTS idx_simultaneous_answers_player 
    ON simultaneous_answers(player_id);

-- ── 2. Start Simultaneous Session ───────────────────────────────────────────

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
    -- Get active players in random order
    SELECT array_agg(id ORDER BY random()) INTO v_players
    FROM public.players
    WHERE lobby_code = p_lobby_code
      AND last_seen > (NOW() - INTERVAL '15 seconds');

    IF v_players IS NULL OR array_length(v_players, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No active players found');
    END IF;

    v_first_picker := v_players[1];

    -- Check if arena_state already exists (reconnect resilience)
    SELECT arena_state INTO v_existing_state
    FROM public.lobbies WHERE code = p_lobby_code;

    -- If game already in progress, return current state
    IF v_existing_state IS NOT NULL AND v_existing_state->>'phase' IS NOT NULL
       AND v_existing_state->>'phase' NOT IN ('GAME_OVER') THEN
        RETURN json_build_object(
            'success', true, 
            'status', 'PLAYING', 
            'pickerId', v_existing_state->>'pickerId',
            'resumed', true
        );
    END IF;

    -- Initialize game state
    UPDATE public.lobbies
    SET 
        status = 'PLAYING',
        settings = COALESCE(settings, '{}'::jsonb) || p_settings,
        arena_state = jsonb_build_object(
            'phase', 'PICKING',
            'pickerId', v_first_picker,
            'lastPickerId', v_first_picker,
            'activeQuestion', null,
            'revealedQuestions', '[]'::jsonb,
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

-- ── 3. Open Simultaneous Question ───────────────────────────────────────────

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
BEGIN
    v_server_time := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    v_timer_end := EXTRACT(EPOCH FROM NOW()) + p_timer_seconds;

    -- Force server-side startTime
    p_question_data := jsonb_set(
        p_question_data, 
        '{questionStartTime}', 
        to_jsonb(v_server_time)
    );

    UPDATE public.lobbies
    SET arena_state = jsonb_set(
        jsonb_set(
            jsonb_set(
                COALESCE(arena_state, '{}'::jsonb),
                '{phase}', '"OPEN"'
            ),
            '{activeQuestion}', p_question_data
        ),
        '{timerEndTime}', to_jsonb(v_timer_end)
    )
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'PICKING';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Cannot open question — not in PICKING phase');
    END IF;

    RETURN json_build_object('success', true, 'timerEndTime', v_timer_end);
END;
$$;

-- ── 4. Submit Simultaneous Answer ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_simultaneous_answer(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_answer_text TEXT,
    p_client_time_ms INTEGER DEFAULT 0  -- ms since question open (from client)
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_arena_state JSONB;
    v_active_q JSONB;
    v_question_id TEXT;
    v_question_points INTEGER;
    v_correct_answer TEXT;
    v_scoring_type TEXT;
    v_penalty_type TEXT;
    
    v_player_name TEXT;
    v_player_exists BOOLEAN;
    
    v_is_correct BOOLEAN;
    v_submission_order INTEGER;
    v_correct_count INTEGER;
    v_rank INTEGER;
    v_points INTEGER;
    v_rows_inserted INTEGER;
    
    v_answer_count INTEGER;
    v_active_player_count INTEGER;
    v_results JSONB;
BEGIN
    -- A. Validate player exists
    SELECT EXISTS(
        SELECT 1 FROM public.players 
        WHERE id = p_player_id AND lobby_code = p_lobby_code
    ) INTO v_player_exists;

    IF NOT v_player_exists THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Player not found in this lobby',
            'error_code', 'PLAYER_NOT_FOUND'
        );
    END IF;

    -- B. Fetch lobby state
    SELECT arena_state INTO v_arena_state 
    FROM public.lobbies WHERE code = p_lobby_code;
    
    SELECT name INTO v_player_name 
    FROM public.players WHERE id = p_player_id;

    v_active_q := v_arena_state->'activeQuestion';

    -- C. Validate active question
    IF v_active_q IS NULL OR (v_active_q->>'id') IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active question');
    END IF;

    IF v_arena_state->>'phase' != 'OPEN' THEN
        RETURN json_build_object('success', false, 'error', 'Question not open for answers');
    END IF;

    -- Extract question data
    v_question_id := v_active_q->>'id';
    v_question_points := COALESCE((v_active_q->>'points')::INTEGER, 100);
    v_correct_answer := v_active_q->>'answer_text';

    -- Scoring config from arena_state (set during start_simultaneous_session)
    v_scoring_type := COALESCE(v_arena_state->>'scoringType', 'RELATIVE');
    v_penalty_type := COALESCE(v_arena_state->>'penaltyType', 'HALF');

    -- D. Correctness check (case-insensitive trim)
    v_is_correct := (
        trim(both from lower(COALESCE(p_answer_text, ''))) = 
        trim(both from lower(COALESCE(v_correct_answer, '')))
    );

    -- E. Determine submission order (sequential counter)
    SELECT COALESCE(MAX(submission_order), 0) + 1 INTO v_submission_order
    FROM public.simultaneous_answers
    WHERE lobby_code = p_lobby_code AND question_id = v_question_id;

    -- F. Calculate rank and points
    IF v_is_correct THEN
        -- Count existing correct answers to determine rank
        SELECT COUNT(*) INTO v_correct_count
        FROM public.simultaneous_answers
        WHERE lobby_code = p_lobby_code 
          AND question_id = v_question_id 
          AND is_correct = true;

        v_rank := v_correct_count + 1;

        IF v_scoring_type = 'FASTEST_FINGER' THEN
            -- Only first correct gets points
            IF v_rank = 1 THEN
                v_points := v_question_points;
            ELSE
                v_points := 0;
            END IF;
        ELSE
            -- RELATIVE scoring
            CASE v_rank
                WHEN 1 THEN v_points := v_question_points;
                WHEN 2 THEN v_points := FLOOR(v_question_points * 0.75);
                WHEN 3 THEN v_points := FLOOR(v_question_points * 0.50);
                WHEN 4 THEN v_points := FLOOR(v_question_points * 0.25);
                ELSE v_points := GREATEST(FLOOR(v_question_points * 0.10), 10);
            END CASE;
        END IF;
    ELSE
        -- Wrong answer penalty
        IF v_penalty_type = 'FULL' THEN
            v_points := -v_question_points;
        ELSE
            v_points := -FLOOR(v_question_points * 0.50);
        END IF;
        v_rank := NULL;
    END IF;

    -- G. Idempotent insert
    INSERT INTO public.simultaneous_answers (
        lobby_code, question_id, player_id, player_name,
        answer_text, is_correct, answer_time_ms, submission_order, rank, points_awarded
    ) VALUES (
        p_lobby_code, v_question_id, p_player_id, v_player_name,
        p_answer_text, v_is_correct, p_client_time_ms, v_submission_order, v_rank, v_points
    )
    ON CONFLICT ON CONSTRAINT unique_simultaneous_answer DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    -- Update player score only for new inserts
    IF v_rows_inserted > 0 THEN
        UPDATE public.players 
        SET score = COALESCE(score, 0) + v_points
        WHERE id = p_player_id;
    END IF;

    -- H. Check if all active players have answered
    SELECT COUNT(*) FROM public.players 
    WHERE lobby_code = p_lobby_code 
      AND last_seen > (NOW() - INTERVAL '15 seconds')
    INTO v_active_player_count;

    SELECT COUNT(*) FROM public.simultaneous_answers 
    WHERE lobby_code = p_lobby_code AND question_id = v_question_id 
    INTO v_answer_count;

    IF v_active_player_count > 0 AND v_answer_count >= v_active_player_count THEN
        -- Transition to RESULTS
        UPDATE public.lobbies
        SET arena_state = jsonb_set(
            COALESCE(arena_state, '{}'::jsonb),
            '{phase}', '"RESULTS"'
        )
        WHERE code = p_lobby_code
          AND arena_state->>'phase' = 'OPEN';
    END IF;

    RETURN json_build_object(
        'success', true,
        'correct', v_is_correct,
        'rank', v_rank,
        'points', v_points,
        'duplicate', (v_rows_inserted = 0),
        'all_answered', (v_answer_count >= v_active_player_count),
        'answers_received', v_answer_count,
        'total_players', v_active_player_count
    );
END;
$$;

-- ── 5. Next Simultaneous Turn ───────────────────────────────────────────────
-- After RESULTS phase, determines next picker and transitions to PICKING.
-- Pick logic: first correct answerer (rank=1) picks next.
-- If everyone wrong: lastPickerId continues.

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

    -- Find the rank-1 correct answerer for this question
    SELECT player_id INTO v_next_picker_id
    FROM public.simultaneous_answers
    WHERE lobby_code = p_lobby_code
      AND question_id = v_question_id
      AND is_correct = true
      AND rank = 1
    LIMIT 1;

    -- If no correct answerer found, keep the last picker
    IF v_next_picker_id IS NULL THEN
        v_next_picker_id := v_last_picker_id;
    END IF;

    -- Verify next picker is still active
    SELECT EXISTS(
        SELECT 1 FROM public.players 
        WHERE id = v_next_picker_id 
          AND lobby_code = p_lobby_code
          AND last_seen > (NOW() - INTERVAL '15 seconds')
    ) INTO v_is_active;

    IF NOT v_is_active THEN
        -- Fallback: random active player
        SELECT id INTO v_fallback_picker
        FROM public.players 
        WHERE lobby_code = p_lobby_code
          AND last_seen > (NOW() - INTERVAL '15 seconds')
        ORDER BY random() LIMIT 1;

        IF v_fallback_picker IS NOT NULL THEN
            v_next_picker_id := v_fallback_picker;
        END IF;
    END IF;

    -- Mark question as revealed and transition to PICKING
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
        'revealedQuestions', (
            COALESCE(arena_state->'revealedQuestions', '[]'::jsonb) 
            || to_jsonb(v_question_id)
        ),
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

-- ── 6. Force Close Simultaneous Question (timer expiry) ─────────────────────

CREATE OR REPLACE FUNCTION public.force_close_simultaneous_question(
    p_lobby_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

    IF v_penalty_type = 'FULL' THEN
        v_penalty := -v_question_points;
    ELSE
        v_penalty := -FLOOR(v_question_points * 0.50);
    END IF;

    -- Auto-submit TIMEOUT for all active players who haven't answered
    FOR v_player IN 
        SELECT p.id, p.name 
        FROM public.players p
        WHERE p.lobby_code = p_lobby_code
          AND p.last_seen > (NOW() - INTERVAL '15 seconds')
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

    -- Transition to RESULTS
    UPDATE public.lobbies
    SET arena_state = jsonb_set(
        COALESCE(arena_state, '{}'::jsonb),
        '{phase}', '"RESULTS"'
    )
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'OPEN';

    RETURN json_build_object(
        'success', true,
        'timeout_players', v_inserted_count
    );
END;
$$;

-- ── 7. Auto-close stale simultaneous questions (server timer) ───────────────

CREATE OR REPLACE FUNCTION public.auto_close_stale_simultaneous_questions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    stale_lobby RECORD;
    now_epoch DOUBLE PRECISION;
BEGIN
    now_epoch := EXTRACT(EPOCH FROM NOW());

    FOR stale_lobby IN
        SELECT code
        FROM public.lobbies
        WHERE
            mode = 'SIMULTANEOUS'
            AND status IN ('PLAYING')
            AND arena_state IS NOT NULL
            AND arena_state->>'phase' = 'OPEN'
            AND (arena_state->>'timerEndTime')::DOUBLE PRECISION IS NOT NULL
            AND (arena_state->>'timerEndTime')::DOUBLE PRECISION < (now_epoch - 5)
    LOOP
        PERFORM public.force_close_simultaneous_question(stale_lobby.code);
        
        RAISE NOTICE '[SimulTimer] Auto-closed stale question for lobby %',
            stale_lobby.code;
    END LOOP;
END;
$$;
