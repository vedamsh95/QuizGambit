-- P2: Secure Timing (Anti-Cheat) & P3: Stale Picker Watchdog

-- 1. Update open_arena_question to store MS timestamp
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
    -- Get server time in MS
    v_server_time := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    
    -- Inject secure timestamp
    p_question_data := jsonb_set(
        p_question_data, 
        '{questionStartTime}', 
        to_jsonb(v_server_time)
    );

    UPDATE lobbies 
    SET arena_state = jsonb_build_object(
        'phase', 'OPEN',
        'pickerId', arena_state->'pickerId',
        'activeQuestion', p_question_data,
        'revealedQuestions', arena_state->'revealedQuestions',
        'timerEndTime', (extract(epoch from now()) + p_timer_seconds) -- Client convenience only
    )
    WHERE code = p_lobby_code;

    RETURN json_build_object('success', true);
END;
$$;

-- 2. Update submit_arena_answer to use SERVER TIME
CREATE OR REPLACE FUNCTION submit_arena_answer(
    p_lobby_code TEXT,
    p_question_id TEXT,
    p_player_id UUID,
    p_player_name TEXT,
    p_answer_text TEXT,
    -- p_answer_time_ms REMOVED (Ignored)
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
    v_rows_inserted INTEGER;
    v_player_count INTEGER;
    v_answer_count INTEGER;
    v_start_time_ms BIGINT;
    v_current_time_ms BIGINT;
    v_actual_time_taken INTEGER;
    v_arena_state JSONB;
BEGIN
    -- P2: Get Server Start Time
    SELECT arena_state INTO v_arena_state FROM lobbies WHERE code = p_lobby_code;
    v_start_time_ms := (v_arena_state->'activeQuestion'->>'questionStartTime')::BIGINT;
    v_current_time_ms := (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT;
    
    -- Force lower bound 0
    IF v_start_time_ms IS NULL THEN
        v_actual_time_taken := 99999; -- Penalty for broken state
    ELSE
        v_actual_time_taken := GREATEST(0, (v_current_time_ms - v_start_time_ms)::INTEGER);
    END IF;

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
        v_points := -FLOOR(p_question_points * 0.25);
        v_rank := NULL;
    END IF;
    
    -- IDEMPOTENT INSERT
    INSERT INTO arena_answers (
        lobby_code, question_id, player_id, player_name, 
        answer_text, is_correct, answer_time_ms, rank, points_awarded
    ) VALUES (
        p_lobby_code, p_question_id, p_player_id, p_player_name,
        p_answer_text, v_is_correct, v_actual_time_taken, v_rank, v_points
    )
    ON CONFLICT ON CONSTRAINT unique_answer_per_turn DO NOTHING;
    
    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted > 0 THEN
        UPDATE players 
        SET score = COALESCE(score, 0) + v_points
        WHERE id = p_player_id;
    END IF;

    -- Check All Answered
    SELECT count(*) FROM players WHERE lobby_code = p_lobby_code INTO v_player_count;
    SELECT count(*) FROM arena_answers WHERE lobby_code = p_lobby_code AND question_id = p_question_id INTO v_answer_count;

    IF v_answer_count >= v_player_count THEN
        UPDATE lobbies
        SET arena_state = jsonb_set(
            COALESCE(arena_state, '{}'::jsonb),
            '{phase}', '"RESULTS"'
        )
        WHERE code = p_lobby_code;
    END IF;
    
    RETURN json_build_object('success', true);
END;
$$;


-- P3: Check Stale Picker (Lazy Watchdog)
CREATE OR REPLACE FUNCTION check_stale_picker(p_lobby_code TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_picker_id UUID;
  v_last_seen TIMESTAMPTZ;
  v_phase TEXT;
BEGIN
  -- Only relevant in PICKING phase
  SELECT 
    (arena_state->>'pickerId')::UUID,
    arena_state->>'phase'
  INTO v_picker_id, v_phase
  FROM lobbies WHERE code = p_lobby_code;

  IF v_phase != 'PICKING' OR v_picker_id IS NULL THEN
    RETURN;
  END IF;

  -- Check picker status
  SELECT last_seen INTO v_last_seen 
  FROM players WHERE id = v_picker_id;

  -- If > 20s inactive, SKIP
  IF v_last_seen < (NOW() - INTERVAL '20 seconds') THEN
     PERFORM next_arena_turn(p_lobby_code, null); -- Trigger next turn logic handling ghost
  END IF;
END;
$$;
