-- RPC to force-close a question when timer expires
-- This auto-submits WRONG answers for players who didn't answer

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
    -- A. Get current state
    SELECT arena_state INTO v_arena_state FROM lobbies WHERE code = p_lobby_code;
    v_active_q := v_arena_state->'activeQuestion';
    
    IF v_active_q IS NULL OR (v_active_q->>'id') IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active question');
    END IF;
    
    -- Only proceed if phase is OPEN
    IF (v_arena_state->>'phase') != 'OPEN' THEN
        RETURN json_build_object('success', false, 'error', 'Question already closed');
    END IF;

    v_question_id := v_active_q->>'id';
    v_question_points := COALESCE((v_active_q->>'points')::INTEGER, 100);
    v_penalty := -FLOOR(v_question_points * 0.25);

    -- B. Find all ACTIVE players who haven't answered
    FOR v_player IN 
        SELECT p.id, p.name 
        FROM players p
        WHERE p.lobby_code = p_lobby_code
          AND p.last_seen > (NOW() - INTERVAL '30 seconds')
          AND NOT EXISTS (
              SELECT 1 FROM arena_answers a 
              WHERE a.lobby_code = p_lobby_code 
                AND a.question_id = v_question_id 
                AND a.player_id = p.id
          )
    LOOP
        -- C. Insert TIMEOUT answer (wrong, with penalty)
        INSERT INTO arena_answers (
            lobby_code, question_id, player_id, player_name,
            answer_text, is_correct, answer_time_ms, rank, points_awarded
        ) VALUES (
            p_lobby_code, v_question_id, v_player.id, v_player.name,
            '[TIMEOUT]', false, 99999, NULL, v_penalty
        )
        ON CONFLICT ON CONSTRAINT unique_answer_per_turn DO NOTHING;
        
        -- D. Apply penalty to player score
        UPDATE players 
        SET score = COALESCE(score, 0) + v_penalty
        WHERE id = v_player.id;
        
        v_inserted_count := v_inserted_count + 1;
    END LOOP;

    -- E. Transition to RESULTS
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
