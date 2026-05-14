-- Fix #5: Wrong answer penalty = -100% (not -25%)
-- Update both RPCs

-- 1. submit_arena_answer
DROP FUNCTION IF EXISTS submit_arena_answer(text, uuid, text);

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
    v_player_exists BOOLEAN;
    
    v_is_correct BOOLEAN;
    v_rank INTEGER;
    v_points INTEGER;
    v_rows_inserted INTEGER;
    
    v_start_time_ms BIGINT;
    v_current_time_ms BIGINT;
    v_actual_time_taken INTEGER;
    v_answer_count INTEGER;
    v_active_player_count INTEGER;
BEGIN
    -- A. VALIDATE PLAYER EXISTS
    SELECT EXISTS(SELECT 1 FROM players WHERE id = p_player_id AND lobby_code = p_lobby_code) 
    INTO v_player_exists;
    
    IF NOT v_player_exists THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Player not found in this lobby. Please rejoin.',
            'error_code', 'PLAYER_NOT_FOUND'
        );
    END IF;

    -- B. Fetch Lobby State & Player Name
    SELECT arena_state INTO v_arena_state FROM lobbies WHERE code = p_lobby_code;
    SELECT name INTO v_player_name FROM players WHERE id = p_player_id;
    
    v_active_q := v_arena_state->'activeQuestion';
    
    -- C. Validate Active Question
    IF v_active_q IS NULL OR (v_active_q->>'id') IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active question');
    END IF;

    -- Extract Server-Side Truths
    v_question_id := v_active_q->>'id';
    v_question_points := COALESCE((v_active_q->>'points')::INTEGER, 100);
    v_q_type := v_active_q->>'q_type';
    v_correct_answer := v_active_q->>'answer_text';
    IF v_q_type = 'NUMERIC' THEN
         v_correct_answer := COALESCE(v_active_q->>'numeric_answer', v_correct_answer);
    END IF;

    -- Time Calculation (Server Side)
    v_start_time_ms := (v_active_q->>'questionStartTime')::BIGINT;
    v_current_time_ms := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    IF v_start_time_ms IS NULL THEN
        v_actual_time_taken := 99999; 
    ELSE
        v_actual_time_taken := GREATEST(0, (v_current_time_ms - v_start_time_ms)::INTEGER);
    END IF;

    -- D. Scoring Logic
    v_is_correct := (trim(both from lower(p_answer_text)) = trim(both from lower(COALESCE(v_correct_answer, ''))));

    IF v_is_correct THEN
        SELECT count(*) + 1 INTO v_rank
        FROM arena_answers
        WHERE lobby_code = p_lobby_code 
          AND question_id = v_question_id 
          AND is_correct = true;
          
        CASE v_rank
            WHEN 1 THEN v_points := v_question_points;
            WHEN 2 THEN v_points := FLOOR(v_question_points * 0.75);
            WHEN 3 THEN v_points := FLOOR(v_question_points * 0.50);
            WHEN 4 THEN v_points := FLOOR(v_question_points * 0.25);
            ELSE v_points := FLOOR(v_question_points * 0.10);
        END CASE;
    ELSE
        -- FIX #5: Wrong answer = -100% of points
        v_points := -v_question_points;
        v_rank := NULL;
    END IF;
    
    -- E. IDEMPOTENT INSERT
    INSERT INTO arena_answers (
        lobby_code, question_id, player_id, player_name, 
        answer_text, is_correct, answer_time_ms, rank, points_awarded
    ) VALUES (
        p_lobby_code, v_question_id, p_player_id, v_player_name,
        p_answer_text, v_is_correct, v_actual_time_taken, v_rank, v_points
    )
    ON CONFLICT ON CONSTRAINT unique_answer_per_turn DO NOTHING;
    
    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted > 0 THEN
        UPDATE players 
        SET score = COALESCE(score, 0) + v_points
        WHERE id = p_player_id;
    END IF;

    -- F. Check All ACTIVE Players Answered (15s threshold)
    SELECT count(*) FROM players 
    WHERE lobby_code = p_lobby_code 
      AND last_seen > (NOW() - INTERVAL '15 seconds')
    INTO v_active_player_count;
    
    SELECT count(*) FROM arena_answers 
    WHERE lobby_code = p_lobby_code 
      AND question_id = v_question_id 
    INTO v_answer_count;

    IF v_active_player_count > 0 AND v_answer_count >= v_active_player_count THEN
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
        'duplicate', (v_rows_inserted = 0),
        'active_players', v_active_player_count,
        'answers_received', v_answer_count
    );
END;
$$;

-- 2. Update force_close_question penalty too
CREATE OR REPLACE FUNCTION force_close_question(p_lobby_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_arena_state JSONB;
    v_active_q JSONB;
    v_question_id TEXT;
    v_question_points INTEGER;
    v_player RECORD;
    v_penalty INTEGER;
    v_inserted_count INTEGER := 0;
BEGIN
    SELECT arena_state INTO v_arena_state FROM lobbies WHERE code = p_lobby_code;
    v_active_q := v_arena_state->'activeQuestion';
    
    IF v_active_q IS NULL OR (v_active_q->>'id') IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active question');
    END IF;
    
    IF (v_arena_state->>'phase') != 'OPEN' THEN
        RETURN json_build_object('success', false, 'error', 'Question already closed');
    END IF;

    v_question_id := v_active_q->>'id';
    v_question_points := COALESCE((v_active_q->>'points')::INTEGER, 100);
    
    -- FIX #5: Timeout penalty = -100%
    v_penalty := -v_question_points;

    FOR v_player IN 
        SELECT p.id, p.name 
        FROM players p
        WHERE p.lobby_code = p_lobby_code
          AND p.last_seen > (NOW() - INTERVAL '15 seconds')
          AND NOT EXISTS (
              SELECT 1 FROM arena_answers a 
              WHERE a.lobby_code = p_lobby_code 
                AND a.question_id = v_question_id 
                AND a.player_id = p.id
          )
    LOOP
        INSERT INTO arena_answers (
            lobby_code, question_id, player_id, player_name,
            answer_text, is_correct, answer_time_ms, rank, points_awarded
        ) VALUES (
            p_lobby_code, v_question_id, v_player.id, v_player.name,
            '[TIMEOUT]', false, 99999, NULL, v_penalty
        )
        ON CONFLICT ON CONSTRAINT unique_answer_per_turn DO NOTHING;
        
        UPDATE players 
        SET score = COALESCE(score, 0) + v_penalty
        WHERE id = v_player.id;
        
        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    UPDATE lobbies
    SET arena_state = jsonb_set(
        COALESCE(arena_state, '{}'::jsonb),
        '{phase}', '"RESULTS"'
    )
    WHERE code = p_lobby_code;

    RETURN json_build_object(
        'success', true,
        'timeout_players', v_inserted_count
    );
END;
$$;
