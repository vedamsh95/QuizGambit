-- Update RPC to use explicit ON CONSTRAINT unique_answer_per_turn
CREATE OR REPLACE FUNCTION submit_arena_answer(
    p_lobby_code TEXT,
    p_question_id TEXT,
    p_player_id UUID,
    p_player_name TEXT,
    p_answer_text TEXT,
    p_answer_time_ms INTEGER,
    p_question_points INTEGER,
    p_correct_answer TEXT,
    p_is_numeric BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_is_correct BOOLEAN;
    v_rank INTEGER;
    v_points INTEGER;
    v_answer_count INTEGER;
    v_player_count INTEGER;
    v_rows_inserted INTEGER;
BEGIN
    -- Check correctness
    IF p_is_numeric THEN
         v_is_correct := (trim(both from lower(p_answer_text)) = trim(both from lower(p_correct_answer)));
    ELSE
        v_is_correct := (trim(both from lower(p_answer_text)) = trim(both from lower(p_correct_answer)));
    END IF;

    IF v_is_correct THEN
        -- Determine Rank
        SELECT count(*) + 1 INTO v_rank
        FROM arena_answers
        WHERE lobby_code = p_lobby_code 
          AND question_id = p_question_id 
          AND is_correct = true;
          
        CASE v_rank
            WHEN 1 THEN v_points := p_question_points;
            WHEN 2 THEN v_points := FLOOR(p_question_points * 0.75);
            WHEN 3 THEN v_points := FLOOR(p_question_points * 0.50);
            WHEN 4 THEN v_points := FLOOR(p_question_points * 0.25);
            ELSE v_points := FLOOR(p_question_points * 0.10);
        END CASE;
    ELSE
        -- Penalize
        v_points := -FLOOR(p_question_points * 0.25);
        v_rank := NULL;
    END IF;
    
    -- IDEMPOTENT INSERT USING CONSTRAINT NAME
    INSERT INTO arena_answers (
        lobby_code, question_id, player_id, player_name, 
        answer_text, is_correct, answer_time_ms, rank, points_awarded
    ) VALUES (
        p_lobby_code, p_question_id, p_player_id, p_player_name,
        p_answer_text, v_is_correct, p_answer_time_ms, v_rank, v_points
    )
    ON CONFLICT ON CONSTRAINT unique_answer_per_turn DO NOTHING;
    
    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    -- Only update score if we actually inserted a new answer
    IF v_rows_inserted > 0 THEN
        UPDATE players 
        SET score = COALESCE(score, 0) + v_points
        WHERE id = p_player_id;
    END IF;

    -- ALWAYS Check if all answered (Even if this was a duplicate call)
    SELECT count(*) FROM players WHERE lobby_code = p_lobby_code INTO v_player_count;
    SELECT count(*) FROM arena_answers WHERE lobby_code = p_lobby_code AND question_id = p_question_id INTO v_answer_count;

    IF v_answer_count >= v_player_count THEN
        -- Trigger RESULTS
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
        'rank', v_rank, 
        'points', v_points,
        'all_answered', (v_answer_count >= v_player_count),
        'duplicate', (v_rows_inserted = 0)
    );
END;
$$;
