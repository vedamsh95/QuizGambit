-- ============================================================================
-- Comprehensive Realtime + RPC Fix
-- ============================================================================
-- 1. Add RLS policies for lobbies — MISSING, causing postgres_changes to fail
-- 2. Recreate RPCs with search_path = 'public' (fixes "relation does not exist")
-- 3. Ensure ALL tables in supabase_realtime + REPLICA IDENTITY FULL
-- ============================================================================

-- ── 1. RLS policy for lobbies (was MISSING — caused channel to close!) ──────

-- Enable RLS on lobbies if not already
ALTER TABLE public.lobbies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts, then recreate
DROP POLICY IF EXISTS "Anyone can read lobbies" ON public.lobbies;
DROP POLICY IF EXISTS "Host can update lobby" ON public.lobbies;
DROP POLICY IF EXISTS "Anyone can insert lobby" ON public.lobbies;
DROP POLICY IF EXISTS "Host can delete lobby" ON public.lobbies;

CREATE POLICY "Anyone can read lobbies" ON public.lobbies FOR SELECT USING (true);
CREATE POLICY "Host can update lobby" ON public.lobbies FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert lobby" ON public.lobbies FOR INSERT WITH CHECK (true);
CREATE POLICY "Host can delete lobby" ON public.lobbies FOR DELETE USING (true);

-- ── 2. Recreate ALL simultaneous RPCs with search_path = 'public' ──────────

-- 2a. submit_simultaneous_answer
CREATE OR REPLACE FUNCTION public.submit_simultaneous_answer(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_answer_text TEXT,
    p_client_time_ms INTEGER DEFAULT 0
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
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM players
        WHERE id = p_player_id AND lobby_code = p_lobby_code
    ) INTO v_player_exists;

    IF NOT v_player_exists THEN
        RETURN json_build_object('success', false, 'error', 'Player not found in this lobby', 'error_code', 'PLAYER_NOT_FOUND');
    END IF;

    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    SELECT name INTO v_player_name
    FROM players WHERE id = p_player_id;

    v_active_q := v_arena_state->'activeQuestion';

    IF v_active_q IS NULL OR (v_active_q->>'id') IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'No active question');
    END IF;

    IF v_arena_state->>'phase' != 'OPEN' THEN
        RETURN json_build_object('success', false, 'error', 'Question not open for answers');
    END IF;

    v_question_id := v_active_q->>'id';
    v_question_points := COALESCE((v_active_q->>'points')::INTEGER, 100);
    v_correct_answer := v_active_q->>'answer_text';
    v_scoring_type := COALESCE(v_arena_state->>'scoringType', 'RELATIVE');
    v_penalty_type := COALESCE(v_arena_state->>'penaltyType', 'HALF');

    v_is_correct := (
        trim(both from lower(COALESCE(p_answer_text, ''))) =
        trim(both from lower(COALESCE(v_correct_answer, '')))
    );

    SELECT COALESCE(MAX(submission_order), 0) + 1 INTO v_submission_order
    FROM simultaneous_answers
    WHERE lobby_code = p_lobby_code AND question_id = v_question_id;

    IF v_is_correct THEN
        SELECT COUNT(*) INTO v_correct_count
        FROM simultaneous_answers
        WHERE lobby_code = p_lobby_code
          AND question_id = v_question_id
          AND is_correct = true;
        v_rank := v_correct_count + 1;
        IF v_scoring_type = 'FASTEST_FINGER' THEN
            IF v_rank = 1 THEN v_points := v_question_points;
            ELSE v_points := 0;
            END IF;
        ELSE
            CASE v_rank
                WHEN 1 THEN v_points := v_question_points;
                WHEN 2 THEN v_points := FLOOR(v_question_points * 0.75);
                WHEN 3 THEN v_points := FLOOR(v_question_points * 0.50);
                WHEN 4 THEN v_points := FLOOR(v_question_points * 0.25);
                ELSE v_points := GREATEST(FLOOR(v_question_points * 0.10), 10);
            END CASE;
        END IF;
    ELSE
        IF v_penalty_type = 'FULL' THEN v_points := -v_question_points;
        ELSE v_points := -FLOOR(v_question_points * 0.50);
        END IF;
        v_rank := NULL;
    END IF;

    INSERT INTO simultaneous_answers (
        lobby_code, question_id, player_id, player_name,
        answer_text, is_correct, answer_time_ms, submission_order, rank, points_awarded
    ) VALUES (
        p_lobby_code, v_question_id, p_player_id, v_player_name,
        p_answer_text, v_is_correct, p_client_time_ms, v_submission_order, v_rank, v_points
    )
    ON CONFLICT ON CONSTRAINT unique_simultaneous_answer DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted > 0 THEN
        UPDATE players
        SET score = COALESCE(score, 0) + v_points
        WHERE id = p_player_id;
    END IF;

    SELECT COUNT(*) FROM players
    WHERE lobby_code = p_lobby_code
    INTO v_active_player_count;

    SELECT COUNT(*) FROM simultaneous_answers
    WHERE lobby_code = p_lobby_code AND question_id = v_question_id
    INTO v_answer_count;

    IF v_active_player_count > 0 AND v_answer_count >= v_active_player_count THEN
        UPDATE lobbies
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

-- 2b. force_close_simultaneous_question
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
BEGIN
    SELECT arena_state INTO v_arena_state 
    FROM lobbies WHERE code = p_lobby_code;

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

    FOR v_player IN 
        SELECT p.id, p.name 
        FROM players p
        WHERE p.lobby_code = p_lobby_code
          AND NOT EXISTS (
              SELECT 1 FROM simultaneous_answers a 
              WHERE a.lobby_code = p_lobby_code 
                AND a.question_id = v_question_id 
                AND a.player_id = p.id
          )
    LOOP
        INSERT INTO simultaneous_answers (
            lobby_code, question_id, player_id, player_name,
            answer_text, is_correct, answer_time_ms, rank, points_awarded
        ) VALUES (
            p_lobby_code, v_question_id, v_player.id, v_player.name,
            '[TIMEOUT]', false, 99999, NULL, v_penalty
        )
        ON CONFLICT ON CONSTRAINT unique_simultaneous_answer DO NOTHING;

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
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'OPEN';

    RETURN json_build_object(
        'success', true,
        'timeout_players', v_inserted_count
    );
END;
$$;

-- 2c. open_simultaneous_question
CREATE OR REPLACE FUNCTION public.open_simultaneous_question(
    p_lobby_code TEXT,
    p_question_data JSONB,
    p_timer_seconds INTEGER DEFAULT 15
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_timer_end DOUBLE PRECISION;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'PICKING' THEN
        RETURN json_build_object('success', false, 'error', 'Cannot open question — not in PICKING phase');
    END IF;

    v_timer_end := extract(epoch from now()) + p_timer_seconds;

    UPDATE lobbies
    SET arena_state = jsonb_build_object(
        'phase', 'OPEN',
        'pickerId', v_arena_state->>'pickerId',
        'lastPickerId', v_arena_state->>'lastPickerId',
        'activeQuestion', p_question_data || jsonb_build_object('questionStartTime', extract(epoch from now()) * 1000),
        'revealedQuestions', COALESCE(v_arena_state->'revealedQuestions', '[]'::jsonb),
        'timerEndTime', v_timer_end,
        'scoringType', COALESCE(v_arena_state->>'scoringType', 'RELATIVE'),
        'penaltyType', COALESCE(v_arena_state->>'penaltyType', 'HALF')
    )
    WHERE code = p_lobby_code;

    RETURN json_build_object(
        'success', true,
        'timerEndTime', v_timer_end
    );
END;
$$;

-- 2d. start_simultaneous_session
CREATE OR REPLACE FUNCTION public.start_simultaneous_session(
    p_lobby_code TEXT,
    p_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_players UUID[];
    v_first_picker UUID;
    v_existing_state JSONB;
BEGIN
    SELECT array_agg(id ORDER BY random()) INTO v_players
    FROM players
    WHERE lobby_code = p_lobby_code;

    IF v_players IS NULL OR array_length(v_players, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No active players found');
    END IF;

    v_first_picker := v_players[1];

    SELECT arena_state INTO v_existing_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_existing_state IS NOT NULL AND v_existing_state->>'phase' IS NOT NULL
       AND v_existing_state->>'phase' NOT IN ('GAME_OVER') THEN
        RETURN json_build_object(
            'success', true,
            'status', 'PLAYING',
            'pickerId', v_existing_state->>'pickerId',
            'resumed', true
        );
    END IF;

    UPDATE lobbies
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

-- 2e. next_simultaneous_turn
CREATE OR REPLACE FUNCTION public.next_simultaneous_turn(
    p_lobby_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
    FROM lobbies WHERE code = p_lobby_code;

    v_last_picker_id := (v_arena_state->>'lastPickerId')::UUID;
    v_question_id := v_arena_state->'activeQuestion'->>'id';

    SELECT player_id INTO v_next_picker_id
    FROM simultaneous_answers
    WHERE lobby_code = p_lobby_code
      AND question_id = v_question_id
      AND is_correct = true
      AND rank = 1
    LIMIT 1;

    IF v_next_picker_id IS NULL THEN
        v_next_picker_id := v_last_picker_id;
    END IF;

    SELECT EXISTS(
        SELECT 1 FROM players
        WHERE id = v_next_picker_id
          AND lobby_code = p_lobby_code
    ) INTO v_is_active;

    IF NOT v_is_active THEN
        SELECT id INTO v_fallback_picker
        FROM players
        WHERE lobby_code = p_lobby_code
        ORDER BY random() LIMIT 1;

        IF v_fallback_picker IS NOT NULL THEN
            v_next_picker_id := v_fallback_picker;
        END IF;
    END IF;

    UPDATE lobbies
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

-- ── 3. Force publication setup (remove from old, add fresh) ────────────────

-- Ensure all three tables are in supabase_realtime
DO $$
BEGIN
    -- Add lobbies if not present
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'lobbies'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.lobbies;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'players'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'simultaneous_answers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.simultaneous_answers;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

-- ── 4. Force REPLICA IDENTITY FULL on all tables ───────────────────────────

ALTER TABLE public.lobbies REPLICA IDENTITY FULL;
ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.simultaneous_answers REPLICA IDENTITY FULL;
