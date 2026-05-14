-- 1. DROP ALL VARIATIONS (CLEAN SLATE)
DROP FUNCTION IF EXISTS submit_arena_answer(text, uuid, uuid, text, double precision);
DROP FUNCTION IF EXISTS submit_arena_answer(text, text, uuid, text, text, integer, text, boolean);
DROP FUNCTION IF EXISTS submit_arena_answer(text, text, uuid, text, text, text, integer, integer);
DROP FUNCTION IF EXISTS submit_arena_answer(text, text, uuid, text, text, integer, integer, text, boolean);

-- 2. CREATE THE "ONE TRUE" FUNCTION (Simplified Signature + Full Logic)
CREATE OR REPLACE FUNCTION submit_arena_answer(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_answer_text TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_arena_state JSONB;
    v_active_q JSONB;
    v_question_id TEXT;
    v_question_points INTEGER;
    v_correct_answer TEXT;
    v_q_type TEXT;
    
    v_player_name TEXT;
    
    v_is_correct BOOLEAN;
    v_rank INTEGER;
    v_points INTEGER;
    v_rows_inserted INTEGER;
    
    v_start_time_ms BIGINT;
    v_current_time_ms BIGINT;
    v_actual_time_taken INTEGER;
    v_answer_count INTEGER;
    v_player_count INTEGER;
BEGIN
    -- A. Fetch Lobby State & Player Name
    SELECT arena_state INTO v_arena_state FROM lobbies WHERE code = p_lobby_code;
    SELECT name INTO v_player_name FROM players WHERE id = p_player_id;
    
    v_active_q := v_arena_state->'activeQuestion';
    
    -- B. Validate Logic
    IF v_active_q IS NULL OR (v_active_q->>'id') IS NULL THEN
        -- Fail gracefully or throw
        RETURN json_build_object('success', false, 'error', 'No active question');
    END IF;

    -- Extract Server-Side Truths
    v_question_id := v_active_q->>'id';
    v_question_points := (v_active_q->>'points')::INTEGER;
    v_q_type := v_active_q->>'q_type';
    v_correct_answer := v_active_q->>'answer_text';
    -- Handle numeric answer override if needed
    IF v_q_type = 'NUMERIC' THEN
         v_correct_answer := v_active_q->>'numeric_answer';
    END IF;

    -- Time Calculation (Server Side)
    v_start_time_ms := (v_active_q->>'questionStartTime')::BIGINT;
    v_current_time_ms := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    IF v_start_time_ms IS NULL THEN
        v_actual_time_taken := 99999; 
    ELSE
        v_actual_time_taken := GREATEST(0, (v_current_time_ms - v_start_time_ms)::INTEGER);
    END IF;

    -- C. Scoring Logic
    -- Check correctness
    v_is_correct := (trim(both from lower(p_answer_text)) = trim(both from lower(v_correct_answer)));

    IF v_is_correct THEN
        -- Determine Rank (Count how many correct answers exist for this Q)
        SELECT count(*) + 1 INTO v_rank
        FROM arena_answers
        WHERE lobby_code = p_lobby_code 
          AND question_id = v_question_id 
          AND is_correct = true;
          
        -- Points Logic
        CASE v_rank
            WHEN 1 THEN v_points := v_question_points;
            WHEN 2 THEN v_points := FLOOR(v_question_points * 0.75);
            WHEN 3 THEN v_points := FLOOR(v_question_points * 0.50);
            WHEN 4 THEN v_points := FLOOR(v_question_points * 0.25);
            ELSE v_points := FLOOR(v_question_points * 0.10);
        END CASE;
    ELSE
        v_points := -FLOOR(v_question_points * 0.25);
        v_rank := NULL;
    END IF;
    
    -- D. IDEMPOTENT INSERT
    INSERT INTO arena_answers (
        lobby_code, question_id, player_id, player_name, 
        answer_text, is_correct, answer_time_ms, rank, points_awarded
    ) VALUES (
        p_lobby_code, v_question_id, p_player_id, v_player_name,
        p_answer_text, v_is_correct, v_actual_time_taken, v_rank, v_points
    )
    ON CONFLICT ON CONSTRAINT unique_answer_per_turn DO NOTHING;
    
    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    -- Update Score only if new insert
    IF v_rows_inserted > 0 THEN
        UPDATE players 
        SET score = COALESCE(score, 0) + v_points
        WHERE id = p_player_id;
    END IF;

    -- E. Check All Answered (Trigger Results)
    SELECT count(*) FROM players WHERE lobby_code = p_lobby_code INTO v_player_count;
    SELECT count(*) FROM arena_answers WHERE lobby_code = p_lobby_code AND question_id = v_question_id INTO v_answer_count;

    IF v_answer_count >= v_player_count THEN
        UPDATE lobbies
        SET arena_state = jsonb_set(
            COALESCE(arena_state, '{}'::jsonb),
            '{phase}', '"RESULTS"'
        )
        WHERE code = p_lobby_code;
    END IF;
    
    RETURN json_build_object(
        'success', true, 
        'correct', v_is_correct, 
        'points', v_points,
        'duplicate', (v_rows_inserted = 0)
    );
END;
$$;
