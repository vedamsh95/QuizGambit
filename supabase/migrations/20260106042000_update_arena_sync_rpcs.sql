-- Arena Mode RPC Functions (Synced with Production DB)

-- 1. Start Arena Session
-- Initializes the session and picks a random starting player
CREATE OR REPLACE FUNCTION start_arena_session(p_lobby_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_players UUID[];
    v_first_picker UUID;
BEGIN
    -- Get all players in random order
    SELECT array_agg(id ORDER BY random()) INTO v_players
    FROM players
    WHERE lobby_code = p_lobby_code;
    
    IF v_players IS NULL OR array_length(v_players, 1) = 0 THEN
         RETURN json_build_object('success', false, 'error', 'No players in lobby');
    END IF;

    -- Pick first player
    v_first_picker := v_players[1];

    -- Update lobby status AND initialize arena_state
    UPDATE lobbies 
    SET 
        status = 'PLAYING'::lobby_status,
        arena_state = jsonb_build_object(
            'phase', 'PICKING',
            'pickerId', v_first_picker,
            'activeQuestion', null,
            'revealedQuestions', '[]'::jsonb,
            'timerEndTime', null
        )
    WHERE code = p_lobby_code;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lobby not found');
    END IF;
    
    RETURN json_build_object('success', true, 'status', 'PLAYING', 'pickerId', v_first_picker);
END;
$$;

-- 2. Open Arena Question
-- Opens a question, sets state to OPEN, sets timer based on server time
CREATE OR REPLACE FUNCTION open_arena_question(
    p_lobby_code TEXT,
    p_question_data JSONB,
    p_timer_seconds INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_server_time BIGINT;
BEGIN
    v_server_time := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;

    -- Force startTime to be server time
    p_question_data := jsonb_set(
        p_question_data, 
        '{startTime}', 
        to_jsonb(v_server_time)
    );

    -- Update state to OPEN
    UPDATE lobbies
    SET arena_state = jsonb_set(
        jsonb_set(
            jsonb_set(
                COALESCE(arena_state, '{}'::jsonb),
                '{phase}', '"OPEN"'
            ),
            '{activeQuestion}', p_question_data
        ),
        '{timerEndTime}', ((v_server_time / 1000) + p_timer_seconds)::text::jsonb
    )
    WHERE code = p_lobby_code;

    RETURN json_build_object('success', true);
END;
$$;

-- 3. Submit Arena Answer
-- Records answer, calculates rank/points, checks if all answered -> RESULTS
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
    v_start_time BIGINT;
    v_is_correct BOOLEAN;
    v_rank INTEGER;
    v_points INTEGER;
    v_answer_count INTEGER;
    v_player_count INTEGER;
    v_diff INTEGER;
BEGIN
    -- Check correctness
    IF p_is_numeric THEN
        -- Numeric logic: check explicit equality or allow client to handle? 
        -- For now simple equality exact match on text
        v_is_correct := (p_answer_text = p_correct_answer);
        
        -- Override points for pure numeric closeness? 
        -- Current implementation assumes 'Price is Right' style generic logic handled here?
        -- Actually client passes processed correctness? No, client passes answer.
        -- Let's stick to simple string match for now as per previous implementation logic
         v_is_correct := (trim(both from lower(p_answer_text)) = trim(both from lower(p_correct_answer)));
    ELSE
        v_is_correct := (p_answer_text = p_correct_answer);
    END IF;

    IF v_is_correct THEN
        -- Determine Rank
        SELECT count(*) + 1 INTO v_rank
        FROM arena_answers
        WHERE lobby_code = p_lobby_code 
          AND question_id = p_question_id 
          AND is_correct = true;
          
        -- Calculate Points (1st=100%, 2nd=75%, 3rd=50%, 4th=25%, 5th+=10%)
        CASE v_rank
            WHEN 1 THEN v_points := p_question_points;
            WHEN 2 THEN v_points := FLOOR(p_question_points * 0.75);
            WHEN 3 THEN v_points := FLOOR(p_question_points * 0.50);
            WHEN 4 THEN v_points := FLOOR(p_question_points * 0.25);
            ELSE v_points := FLOOR(p_question_points * 0.10);
        END CASE;
    ELSE
        -- Wrong answer penalty
        v_points := -FLOOR(p_question_points * 0.25);
        v_rank := NULL;
    END IF;
    
    INSERT INTO arena_answers (
        lobby_code, question_id, player_id, player_name, 
        answer_text, is_correct, answer_time_ms, rank, points_awarded
    ) VALUES (
        p_lobby_code, p_question_id, p_player_id, p_player_name,
        p_answer_text, v_is_correct, p_answer_time_ms, v_rank, v_points
    );
    
    UPDATE players 
    SET score = COALESCE(score, 0) + v_points
    WHERE id = p_player_id;

    -- Check if all answered
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
        'all_answered', (v_answer_count >= v_player_count)
    );
END;
$$;

-- 4. Next Arena Turn
-- Sets phase back to PICKING, sets next picker, clears active question
CREATE OR REPLACE FUNCTION next_arena_turn(
    p_lobby_code TEXT,
    p_next_picker_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_q_id TEXT;
BEGIN
    SELECT arena_state->'activeQuestion'->>'id' INTO v_old_q_id
    FROM lobbies WHERE code = p_lobby_code;

    UPDATE lobbies
    SET arena_state = (CASE 
        WHEN arena_state IS NULL THEN '{}'::jsonb 
        ELSE arena_state 
    END) 
    || jsonb_build_object(
        'phase', 'PICKING',
        'pickerId', p_next_picker_id,
        'activeQuestion', null,
        'revealedQuestions', (
            COALESCE(arena_state->'revealedQuestions', '[]'::jsonb) 
            || to_jsonb(v_old_q_id)
        ),
        'timerEndTime', null
    )
    WHERE code = p_lobby_code;

    RETURN json_build_object('success', true);
END;
$$;
