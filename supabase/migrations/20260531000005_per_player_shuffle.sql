-- ============================================================================
-- Per-Player Shuffle — Each player gets their own letters
-- ============================================================================
-- Before: arena_state.letters was shared. Any shuffle changed it for everyone.
-- After:  arena_state.playerLetters[playerId] is per-player. Shuffles are self-only.
--         submit_links_sprint_word validates against the player's own letters.
-- ============================================================================

-- ── 1. start_links_sprint_game — populate playerLetters on game start ───────

CREATE OR REPLACE FUNCTION public.start_links_sprint_game(
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
    v_player_count INTEGER;
    v_waves INTEGER;
    v_wave_duration INTEGER;
    v_existing_state JSONB;
    v_letters TEXT[];
    v_player_letters JSONB;
    v_letter_count INTEGER;
BEGIN
    SELECT array_agg(id ORDER BY joined_at) INTO v_players
    FROM players WHERE lobby_code = p_lobby_code;
    v_player_count := array_length(v_players, 1);
    IF v_players IS NULL OR v_player_count < 2 THEN
        RETURN json_build_object('success', false, 'error', 'Need at least 2 players');
    END IF;
    IF v_player_count > 6 THEN
        RETURN json_build_object('success', false, 'error', 'Maximum 6 players');
    END IF;
    SELECT arena_state INTO v_existing_state FROM lobbies WHERE code = p_lobby_code;
    IF v_existing_state IS NOT NULL AND v_existing_state->>'phase' IS NOT NULL
       AND v_existing_state->>'phase' IN ('WAVE_INTRO', 'PLAYING', 'WAVE_RESULTS') THEN
        RETURN json_build_object('success', true, 'status', 'PLAYING', 'phase', v_existing_state->>'phase', 'resumed', true);
    END IF;
    v_waves := COALESCE((p_settings->>'waves')::integer, 3);
    v_wave_duration := COALESCE((p_settings->>'waveDuration')::integer, 60);
    v_letter_count := v_player_count;
    v_letters := ARRAY['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q'];
    v_letters := ARRAY(SELECT unnest(v_letters) ORDER BY random() LIMIT v_letter_count);

    -- Build per-player letters: every player starts with the same shared letters
    SELECT jsonb_object_agg(id::text, to_jsonb(v_letters))
    INTO v_player_letters
    FROM players WHERE lobby_code = p_lobby_code;

    UPDATE lobbies SET
        status = 'PLAYING',
        mode = 'LINKS_SPRINT',
        settings = COALESCE(settings, '{}'::jsonb) || p_settings,
        arena_state = jsonb_build_object(
            'phase', 'WAVE_INTRO',
            'currentWave', 1,
            'totalWaves', v_waves,
            'letters', to_jsonb(v_letters),
            'playerLetters', COALESCE(v_player_letters, '{}'::jsonb),
            'targetWords', '[]'::jsonb,
            'usedWords', '[]'::jsonb,
            'scores', jsonb_build_object(),
            'waveWords', '[]'::jsonb,
            'waveTimer', v_wave_duration,
            'waveDuration', v_wave_duration,
            'targetReveals', '[]'::jsonb,
            'gameStartTime', extract(epoch from now()) * 1000
        )
    WHERE code = p_lobby_code;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lobby not found');
    END IF;
    RETURN json_build_object('success', true, 'status', 'PLAYING', 'phase', 'WAVE_INTRO',
        'player_count', v_player_count, 'waves', v_waves, 'letters', v_letters);
END;
$$;

-- ── 2. submit_links_sprint_word — validate against player's own letters ─────

CREATE OR REPLACE FUNCTION public.submit_links_sprint_word(
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
    v_word TEXT; v_word_len INTEGER; v_letters TEXT[];
    v_used_words JSONB; v_player_name TEXT;
    v_points INTEGER := 0; v_is_target BOOLEAN := false;
    v_target_level INTEGER := null; v_targets JSONB;
    v_target_entry JSONB; v_rows_inserted INTEGER;
    v_current_wave INTEGER; v_letter TEXT;
    v_player_letters JSONB;
BEGIN
    SELECT arena_state INTO v_arena_state FROM lobbies WHERE code = p_lobby_code;
    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Game is not in playing phase');
    END IF;
    v_word := lower(trim(p_word));
    IF v_word !~ '^[a-z]{3,15}$' THEN
        RETURN json_build_object('success', false, 'error', 'Word must be 3-15 letters, a-z only');
    END IF;
    v_word_len := length(v_word);

    -- Use player-specific letters if available, otherwise fall back to shared letters
    v_player_letters := v_arena_state->'playerLetters'->(p_player_id::text);
    IF v_player_letters IS NOT NULL AND jsonb_array_length(v_player_letters) > 0 THEN
        v_letters := ARRAY(SELECT jsonb_array_elements_text(v_player_letters));
    ELSE
        v_letters := ARRAY(SELECT jsonb_array_elements_text(v_arena_state->'letters'));
    END IF;

    v_current_wave := COALESCE((v_arena_state->>'currentWave')::integer, 1);
    FOREACH v_letter IN ARRAY v_letters LOOP
        IF position(lower(v_letter) in v_word) = 0 THEN
            RETURN json_build_object('success', false, 'error', 'Missing required letter: ' || v_letter, 'error_code', 'MISSING_LETTER');
        END IF;
    END LOOP;
    v_used_words := COALESCE(v_arena_state->'usedWords', '[]'::jsonb);
    IF v_used_words ? v_word THEN
        RETURN json_build_object('success', false, 'error', 'Word already claimed', 'error_code', 'ALREADY_USED');
    END IF;
    SELECT name INTO v_player_name FROM players WHERE id = p_player_id;
    CASE WHEN v_word_len <= 4 THEN v_points := 10 * v_word_len;
         WHEN v_word_len <= 6 THEN v_points := 15 * v_word_len;
         WHEN v_word_len <= 8 THEN v_points := 20 * v_word_len;
         ELSE v_points := 30 * v_word_len;
    END CASE;
    v_targets := COALESCE(v_arena_state->'targetWords', '[]'::jsonb);
    FOR v_target_entry IN SELECT jsonb_array_elements(v_targets) LOOP
        IF lower(v_target_entry->>'word') = v_word THEN
            v_is_target := true; v_target_level := (v_target_entry->>'level')::integer;
            v_points := v_points + (v_target_entry->>'bonus')::integer; EXIT;
        END IF;
    END LOOP;
    INSERT INTO links_sprint_words (lobby_code, player_id, player_name, word, word_length, points, is_target, target_level, wave)
    VALUES (p_lobby_code, p_player_id, v_player_name, v_word, v_word_len, v_points, v_is_target, v_target_level, v_current_wave)
    ON CONFLICT ON CONSTRAINT unique_sprint_word DO NOTHING;
    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
    IF v_rows_inserted = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Word already claimed (race condition)', 'error_code', 'ALREADY_USED');
    END IF;
    v_used_words := v_used_words || to_jsonb(v_word);
    UPDATE players SET score = COALESCE(score, 0) + v_points WHERE id = p_player_id;
    UPDATE lobbies SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
        'usedWords', v_used_words,
        'scores', (SELECT jsonb_object_agg(id::text, COALESCE(score, 0)) FROM players WHERE lobby_code = p_lobby_code)
    ) WHERE code = p_lobby_code AND arena_state->>'phase' = 'PLAYING';
    RETURN json_build_object('success', true, 'word', v_word, 'points', v_points, 'is_target', v_is_target, 'target_level', v_target_level, 'wave', v_current_wave);
END;
$$;

-- ── 3. start_links_sprint_wave — reset playerLetters for new wave ───────────

CREATE OR REPLACE FUNCTION public.start_links_sprint_wave(
    p_lobby_code TEXT,
    p_letters JSONB,
    p_target_words JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_current_wave INTEGER;
    v_total_waves INTEGER;
    v_wave_duration INTEGER;
    v_new_wave INTEGER;
    v_new_phase TEXT;
    v_current_phase TEXT;
    v_player_letters JSONB;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    v_current_wave := COALESCE((v_arena_state->>'currentWave')::integer, 1);
    v_total_waves := COALESCE((v_arena_state->>'totalWaves')::integer, 3);
    v_wave_duration := COALESCE((v_arena_state->>'waveDuration')::integer, 60);
    v_current_phase := v_arena_state->>'phase';

    -- Don't increment wave on the very first call from WAVE_INTRO
    IF v_current_phase = 'WAVE_INTRO' THEN
        v_new_wave := v_current_wave;
    ELSE
        v_new_wave := v_current_wave + 1;
    END IF;

    IF v_new_wave > v_total_waves THEN
        v_new_phase := 'GAME_OVER';
        UPDATE lobbies
        SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', 'GAME_OVER',
            'scores', (
                SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
                FROM players WHERE lobby_code = p_lobby_code
            )
        )
        WHERE code = p_lobby_code;
    ELSE
        -- Reset per-player letters: everyone starts the new wave with shared letters
        SELECT jsonb_object_agg(id::text, p_letters)
        INTO v_player_letters
        FROM players WHERE lobby_code = p_lobby_code;

        v_new_phase := 'PLAYING';
        UPDATE lobbies
        SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', 'PLAYING',
            'currentWave', v_new_wave,
            'letters', p_letters,
            'playerLetters', COALESCE(v_player_letters, '{}'::jsonb),
            'targetWords', p_target_words,
            'usedWords', '[]'::jsonb,
            'waveWords', '[]'::jsonb,
            'shuffleCounts', '{}'::jsonb,
            'playerTimers', '{}'::jsonb,
            'shuffleDeductions', COALESCE(v_arena_state->'shuffleDeductions', '{}'::jsonb)
        )
        WHERE code = p_lobby_code;
    END IF;

    RETURN json_build_object(
        'success', true,
        'phase', v_new_phase,
        'wave', v_new_wave
    );
END;
$$;

-- ── 4. shuffle_links_sprint_letters — update only the shuffling player ──────

CREATE OR REPLACE FUNCTION public.shuffle_links_sprint_letters(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_shuffle_type TEXT,
    p_new_letters JSONB DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB; v_shuffle_counts JSONB; v_player_shuffles JSONB;
    v_all_shuffles INTEGER; v_single_shuffles INTEGER;
    v_points_deduction INTEGER := 0; v_time_penalty INTEGER := 0;
    v_current_score INTEGER;
    v_total_points INTEGER; v_points_pct NUMERIC;
    v_update_json JSONB; v_existing_deductions INTEGER;
    v_player_letters JSONB;
BEGIN
    SELECT arena_state INTO v_arena_state FROM lobbies WHERE code = p_lobby_code;
    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Not in playing phase');
    END IF;
    SELECT COALESCE(score, 0) INTO v_current_score FROM players WHERE id = p_player_id AND lobby_code = p_lobby_code;
    v_shuffle_counts := COALESCE(v_arena_state->'shuffleCounts', '{}'::jsonb);
    v_player_shuffles := COALESCE(v_shuffle_counts->(p_player_id::text), '{}'::jsonb);
    v_all_shuffles := COALESCE((v_player_shuffles->>'all')::integer, 0);
    v_single_shuffles := COALESCE((v_player_shuffles->>'single')::integer, 0);
    IF p_shuffle_type = 'all' THEN
        v_all_shuffles := v_all_shuffles + 1; v_time_penalty := 5;
        IF v_all_shuffles <= 1 THEN v_points_pct := 0.25; ELSE v_points_pct := 0.50; END IF;
        v_player_shuffles := v_player_shuffles || jsonb_build_object('all', v_all_shuffles);
    ELSIF p_shuffle_type = 'single' THEN
        v_single_shuffles := v_single_shuffles + 1; v_time_penalty := 3; v_points_pct := 0.25;
        v_player_shuffles := v_player_shuffles || jsonb_build_object('single', v_single_shuffles);
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid shuffle type');
    END IF;
    v_total_points := (SELECT COALESCE(SUM(points), 0) FROM links_sprint_words
                       WHERE lobby_code = p_lobby_code AND player_id = p_player_id);
    v_points_deduction := FLOOR(v_total_points * v_points_pct);
    UPDATE players SET score = GREATEST(0, COALESCE(score, 0) - v_points_deduction)
    WHERE id = p_player_id AND lobby_code = p_lobby_code;
    v_shuffle_counts := v_shuffle_counts || jsonb_build_object(p_player_id::text, v_player_shuffles);
    v_existing_deductions := COALESCE((v_arena_state->'shuffleDeductions'->>(p_player_id::text))::integer, 0);
    v_update_json := jsonb_build_object(
        'shuffleDeductions', COALESCE(v_arena_state->'shuffleDeductions', '{}'::jsonb) ||
            jsonb_build_object(p_player_id::text, v_existing_deductions + v_points_deduction),
        'shuffleCounts', v_shuffle_counts,
        'playerTimers', (SELECT jsonb_object_agg(id::text,
            GREATEST(0, COALESCE((COALESCE(v_arena_state->'playerTimers', '{}'::jsonb)->>(id::text))::integer,
                (v_arena_state->>'waveDuration')::integer) - CASE WHEN id = p_player_id THEN v_time_penalty ELSE 0 END)
        ) FROM players WHERE lobby_code = p_lobby_code),
        'scores', (SELECT jsonb_object_agg(id::text, COALESCE(score, 0)) FROM players WHERE lobby_code = p_lobby_code)
    );
    -- Update ONLY the shuffling player's letters (not the shared 'letters' field)
    IF p_new_letters IS NOT NULL THEN
        v_player_letters := COALESCE(v_arena_state->'playerLetters', '{}'::jsonb);
        v_update_json := v_update_json || jsonb_build_object(
            'playerLetters', v_player_letters || jsonb_build_object(p_player_id::text, p_new_letters)
        );
    END IF;
    UPDATE lobbies SET arena_state = COALESCE(arena_state, '{}'::jsonb) || v_update_json
    WHERE code = p_lobby_code AND arena_state->>'phase' = 'PLAYING';
    RETURN json_build_object('success', true, 'shuffleType', p_shuffle_type,
        'newAllShuffles', v_all_shuffles, 'newSingleShuffles', v_single_shuffles,
        'pointsDeduction', v_points_deduction, 'timePenalty', v_time_penalty);
END;
$$;

-- ── 5. Grant execute permissions ────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.start_links_sprint_game(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_links_sprint_word(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_links_sprint_wave(TEXT, JSONB, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shuffle_links_sprint_letters(TEXT, UUID, TEXT, JSONB) TO anon, authenticated;
