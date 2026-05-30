-- ============================================================================
-- LINKS — Game Over Logic: 2-Player Tie-Breaker + Last-One-Standing
-- ============================================================================
-- 2 players: When one eliminated → game over (unless scores tied → continue)
-- 3+ players: Continue until only 1 player remains alive
-- Eliminated players spectate
-- ============================================================================

-- ── Update penalize_links_player: last-one-standing end condition ──────────

CREATE OR REPLACE FUNCTION public.penalize_links_player(
    p_lobby_code TEXT,
    p_player_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_player_hearts JSONB;
    v_player_timers JSONB;
    v_player_timer_counts JSONB;
    v_hearts INTEGER;
    v_now DOUBLE PRECISION;
    v_alive_count INTEGER := 0;
    v_player_count INTEGER;
    v_heart_val INTEGER;
    v_player_key TEXT;
    v_new_phase TEXT;
    v_timer_end DOUBLE PRECISION;
    v_scores JSONB;
    v_score_val INTEGER;
    v_first_score INTEGER := NULL;
    v_scores_tied BOOLEAN := true;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Game is not in playing phase');
    END IF;

    v_player_timers := COALESCE(v_arena_state->'playerTimers', '{}'::jsonb);
    v_timer_end := (v_player_timers->>p_player_id::text)::double precision;
    v_now := extract(epoch from now());

    -- Only penalize if timer actually expired (race condition guard)
    IF v_timer_end IS NULL OR v_now < v_timer_end THEN
        RETURN json_build_object('success', false, 'error', 'Timer has not expired yet');
    END IF;

    -- Deduct heart
    v_player_hearts := COALESCE(v_arena_state->'playerHearts', '{}'::jsonb);
    v_hearts := COALESCE((v_player_hearts->>p_player_id::text)::integer, 3);

    -- Don't penalize already dead players
    IF v_hearts <= 0 THEN
        RETURN json_build_object('success', true, 'skipped', true, 'reason', 'Already eliminated');
    END IF;

    v_hearts := v_hearts - 1;
    v_player_hearts := v_player_hearts || jsonb_build_object(p_player_id::text, GREATEST(v_hearts, 0));

    -- Reset timer for next life
    v_player_timer_counts := COALESCE(v_arena_state->'playerTimerCounts', '{}'::jsonb);
    v_player_timers := v_player_timers || jsonb_build_object(
        p_player_id::text, v_now + 30
    );

    -- ── Count alive players (hearts > 0) ────────────────────────────
    SELECT COUNT(*) INTO v_player_count
    FROM players WHERE lobby_code = p_lobby_code;

    v_alive_count := 0;
    FOR v_player_key, v_heart_val IN
        SELECT key, (value::text)::integer FROM jsonb_each(v_player_hearts)
    LOOP
        IF v_heart_val > 0 THEN
            v_alive_count := v_alive_count + 1;
        END IF;
    END LOOP;

    -- ── Determine new phase ─────────────────────────────────────────
    v_new_phase := 'PLAYING';

    IF v_alive_count = 0 THEN
        -- All players eliminated → game over
        v_new_phase := 'RESULTS';
    ELSIF v_alive_count = 1 THEN
        IF v_player_count = 2 THEN
            -- 2-player mode: check if scores are tied
            -- Get scores from players table
            SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
            INTO v_scores
            FROM players WHERE lobby_code = p_lobby_code;

            -- Check if all scores are equal (tied)
            v_scores_tied := true;
            FOR v_player_key, v_score_val IN
                SELECT key, (value::text)::integer FROM jsonb_each(v_scores)
            LOOP
                IF v_first_score IS NULL THEN
                    v_first_score := v_score_val;
                ELSIF v_score_val != v_first_score THEN
                    v_scores_tied := false;
                END IF;
            END LOOP;

            IF v_scores_tied THEN
                -- Scores are tied → continue playing (don't end)
                v_new_phase := 'PLAYING';
            ELSE
                v_new_phase := 'RESULTS';
            END IF;
        ELSE
            -- 3+ players: last one standing → game over
            v_new_phase := 'RESULTS';
        END IF;
    END IF;

    UPDATE lobbies
    SET
        status = CASE WHEN v_new_phase = 'RESULTS' THEN 'LOBBY' ELSE status END,
        arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', v_new_phase,
            'playerHearts', v_player_hearts,
            'playerTimers', v_player_timers,
            'scores', (
                SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
                FROM players WHERE lobby_code = p_lobby_code
            )
        )
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'PLAYING';

    RETURN json_build_object(
        'success', true,
        'hearts_remaining', v_hearts,
        'eliminated', (v_hearts <= 0),
        'phase', v_new_phase,
        'timer_end', v_player_timers->>p_player_id::text,
        'alive_count', v_alive_count
    );
END;
$$;

-- ── Update submit_links_word: last-one-standing end condition ─────────────

CREATE OR REPLACE FUNCTION public.submit_links_word(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_word TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_word TEXT;
    v_word_len INTEGER;
    v_letters TEXT[];
    v_player_letter TEXT;
    v_player_letters JSONB;
    v_used_words JSONB;
    v_player_hearts JSONB;
    v_poison_letters JSONB;
    v_my_poisons JSONB;
    v_hearts INTEGER;
    v_points INTEGER := 0;
    v_is_poisoned BOOLEAN := false;
    v_poison_letter TEXT := null;
    v_player_name TEXT;
    v_rows_inserted INTEGER;
    v_player_count INTEGER;
    v_word_count INTEGER;
    v_all_hearts JSONB;
    v_alive_count INTEGER := 0;
    v_heart_val INTEGER;
    v_player_key TEXT;
    v_player_timers JSONB;
    v_player_timer_counts JSONB;
    v_now DOUBLE PRECISION;
    v_timer_duration INTEGER;
    v_word_submission_count INTEGER;
    v_new_phase TEXT;
    v_scores JSONB;
    v_score_val INTEGER;
    v_first_score INTEGER := NULL;
    v_scores_tied BOOLEAN := true;
BEGIN
    -- Fetch lobby state
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Game is not in playing phase');
    END IF;

    -- Validate word format
    v_word := lower(trim(p_word));
    IF v_word !~ '^[a-z]{3,15}$' THEN
        RETURN json_build_object('success', false, 'error', 'Word must be 3-15 letters, a-z only');
    END IF;

    v_word_len := length(v_word);
    v_letters := ARRAY(SELECT jsonb_array_elements_text(v_arena_state->'letters'));

    -- Check word contains ALL required letters
    DECLARE
        v_letter TEXT;
    BEGIN
        FOREACH v_letter IN ARRAY v_letters LOOP
            IF position(lower(v_letter) in v_word) = 0 THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'Missing required letter: ' || v_letter,
                    'error_code', 'MISSING_LETTER'
                );
            END IF;
        END LOOP;
    END;

    -- Check word not already used
    v_used_words := COALESCE(v_arena_state->'usedWords', '[]'::jsonb);
    IF v_used_words ? v_word THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Word already claimed',
            'error_code', 'ALREADY_USED'
        );
    END IF;

    -- Get player info
    SELECT name INTO v_player_name
    FROM players WHERE id = p_player_id;

    v_player_letters := COALESCE(v_arena_state->'playerLetters', '{}'::jsonb);
    v_player_letter := v_player_letters->>p_player_id::text;

    -- Calculate points based on word length
    CASE
        WHEN v_word_len <= 4 THEN v_points := 10 * v_word_len;
        WHEN v_word_len <= 6 THEN v_points := 15 * v_word_len;
        WHEN v_word_len <= 8 THEN v_points := 20 * v_word_len;
        ELSE v_points := 30 * v_word_len;
    END CASE;

    -- Check poison
    v_player_hearts := COALESCE(v_arena_state->'playerHearts', '{}'::jsonb);
    v_poison_letters := COALESCE(v_arena_state->'poisonLetters', '{}'::jsonb);
    v_hearts := COALESCE((v_player_hearts->>p_player_id::text)::integer, 3);

    -- Don't allow submission if player is already dead
    IF v_hearts <= 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'You have been eliminated',
            'error_code', 'ELIMINATED'
        );
    END IF;

    -- Find poison letters assigned TO this player
    DECLARE
        v_assigner_id TEXT;
        v_assigner_poisons JSONB;
        v_poison_for_me TEXT;
    BEGIN
        FOR v_assigner_id, v_assigner_poisons IN
            SELECT key, value FROM jsonb_each(v_poison_letters)
        LOOP
            v_poison_for_me := v_assigner_poisons->>p_player_id::text;
            IF v_poison_for_me IS NOT NULL AND position(lower(v_poison_for_me) in v_word) > 0 THEN
                v_is_poisoned := true;
                v_poison_letter := v_poison_for_me;
                v_hearts := v_hearts - 1;
                EXIT;
            END IF;
        END LOOP;
    END;

    -- Insert word record
    INSERT INTO links_words (
        lobby_code, player_id, player_name,
        word, word_length, points,
        is_poisoned, poison_letter, hearts_remaining
    ) VALUES (
        p_lobby_code, p_player_id, v_player_name,
        v_word, v_word_len, v_points,
        v_is_poisoned, v_poison_letter, v_hearts
    )
    ON CONFLICT ON CONSTRAINT unique_links_word DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted = 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Word already claimed (race condition)',
            'error_code', 'ALREADY_USED'
        );
    END IF;

    -- Update used words
    v_used_words := v_used_words || to_jsonb(v_word);

    -- Update scores
    UPDATE players
    SET score = COALESCE(score, 0) + v_points
    WHERE id = p_player_id;

    -- Update hearts
    v_player_hearts := v_player_hearts || jsonb_build_object(p_player_id::text, GREATEST(v_hearts, 0));

    -- ── Per-player timer reset ────────────────────────────────────
    v_now := extract(epoch from now());
    v_player_timers := COALESCE(v_arena_state->'playerTimers', '{}'::jsonb);
    v_player_timer_counts := COALESCE(v_arena_state->'playerTimerCounts', '{}'::jsonb);

    -- Sudden death scaling: each word reduces timer by 2s, bottom at 8s
    v_word_submission_count := COALESCE((v_player_timer_counts->>p_player_id::text)::integer, 0) + 1;
    v_timer_duration := GREATEST(8, 30 - (v_word_submission_count * 2));

    v_player_timers := v_player_timers || jsonb_build_object(
        p_player_id::text, v_now + v_timer_duration
    );
    v_player_timer_counts := v_player_timer_counts || jsonb_build_object(
        p_player_id::text, v_word_submission_count
    );

    -- ── Count alive players (hearts > 0) ──────────────────────────
    SELECT COUNT(*) INTO v_player_count
    FROM players WHERE lobby_code = p_lobby_code;

    v_alive_count := 0;
    FOR v_player_key, v_heart_val IN
        SELECT key, (value::text)::integer FROM jsonb_each(v_player_hearts)
    LOOP
        IF v_heart_val > 0 THEN
            v_alive_count := v_alive_count + 1;
        END IF;
    END LOOP;

    -- ── Determine new phase ───────────────────────────────────────
    v_new_phase := 'PLAYING';

    IF v_alive_count = 0 THEN
        -- All players eliminated → game over
        v_new_phase := 'RESULTS';
    ELSIF v_alive_count = 1 THEN
        IF v_player_count = 2 THEN
            -- 2-player mode: check if scores are tied
            SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
            INTO v_scores
            FROM players WHERE lobby_code = p_lobby_code;

            -- Check if all scores are equal
            v_scores_tied := true;
            FOR v_player_key, v_score_val IN
                SELECT key, (value::text)::integer FROM jsonb_each(v_scores)
            LOOP
                IF v_first_score IS NULL THEN
                    v_first_score := v_score_val;
                ELSIF v_score_val != v_first_score THEN
                    v_scores_tied := false;
                END IF;
            END LOOP;

            IF v_scores_tied THEN
                -- Scores tied → continue playing
                v_new_phase := 'PLAYING';
            ELSE
                v_new_phase := 'RESULTS';
            END IF;
        ELSE
            -- 3+ players: last one standing → game over
            v_new_phase := 'RESULTS';
        END IF;
    END IF;

    UPDATE lobbies
    SET
        status = CASE WHEN v_new_phase = 'RESULTS' THEN 'LOBBY' ELSE status END,
        arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', v_new_phase,
            'usedWords', v_used_words,
            'playerHearts', v_player_hearts,
            'playerTimers', v_player_timers,
            'playerTimerCounts', v_player_timer_counts,
            'scores', (
                SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
                FROM players WHERE lobby_code = p_lobby_code
            )
        )
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'PLAYING';

    RETURN json_build_object(
        'success', true,
        'word', v_word,
        'points', v_points,
        'is_poisoned', v_is_poisoned,
        'poison_letter', v_poison_letter,
        'hearts_remaining', v_hearts,
        'phase', v_new_phase,
        'timer_end', v_player_timers->>p_player_id::text,
        'timer_duration', v_timer_duration,
        'eliminated', (v_hearts <= 0)
    );
END;
$$;

-- ── Grant permissions ─────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.penalize_links_player(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_links_word(TEXT, UUID, TEXT) TO anon, authenticated;
