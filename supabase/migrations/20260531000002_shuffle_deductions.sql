-- ============================================================================
-- LINKS SPRINT — Cumulative Shuffle Deductions Tracking
-- ============================================================================
-- Add shuffleDeductions to arena_state so the frontend can show per-player
-- shuffle penalty totals in the wave results and game over screens.
-- ============================================================================

-- ── 1. Update start_links_sprint_wave: reset shuffleDeductions on new wave ──

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
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    v_current_wave := COALESCE((v_arena_state->>'currentWave')::integer, 1);
    v_total_waves := COALESCE((v_arena_state->>'totalWaves')::integer, 3);
    v_wave_duration := COALESCE((v_arena_state->>'waveDuration')::integer, 60);

    v_new_wave := v_current_wave + 1;

    IF v_new_wave > v_total_waves THEN
        -- Game over: preserve cumulative shuffleDeductions for the final scoreboard
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
        -- Start next wave: reset shuffleCounts & playerTimers, keep shuffleDeductions cumulative
        v_new_phase := 'PLAYING';
        UPDATE lobbies
        SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', 'PLAYING',
            'currentWave', v_new_wave,
            'letters', p_letters,
            'targetWords', p_target_words,
            'usedWords', '[]'::jsonb,
            'waveWords', '[]'::jsonb,
            'shuffleCounts', '{}'::jsonb,
            'playerTimers', '{}'::jsonb,
            'shuffleDeductions', COALESCE(arena_state->'shuffleDeductions', '{}'::jsonb)
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

-- ── 2. Update shuffle_links_sprint_letters: accumulate deductions ─────────

CREATE OR REPLACE FUNCTION public.shuffle_links_sprint_letters(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_shuffle_type TEXT,  -- 'all' or 'single'
    p_new_letters JSONB DEFAULT NULL  -- optional: new letter array for arena_state sync
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_shuffle_counts JSONB;
    v_player_shuffles JSONB;
    v_all_shuffles INTEGER;
    v_single_shuffles INTEGER;
    v_points_deduction INTEGER := 0;
    v_time_penalty INTEGER := 0;
    v_current_score INTEGER;
    v_player_name TEXT;
    v_total_points INTEGER;
    v_points_pct NUMERIC;
    v_update_json JSONB;
    v_existing_deductions INTEGER;
BEGIN
    -- Fetch current state
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Not in playing phase');
    END IF;

    -- Get current score
    SELECT COALESCE(score, 0) INTO v_current_score
    FROM players WHERE id = p_player_id AND lobby_code = p_lobby_code;

    -- Get shuffle counts
    v_shuffle_counts := COALESCE(v_arena_state->'shuffleCounts', '{}'::jsonb);
    v_player_shuffles := COALESCE(v_shuffle_counts->(p_player_id::text), '{}'::jsonb);
    v_all_shuffles := COALESCE((v_player_shuffles->>'all')::integer, 0);
    v_single_shuffles := COALESCE((v_player_shuffles->>'single')::integer, 0);

    -- Calculate penalty
    IF p_shuffle_type = 'all' THEN
        v_all_shuffles := v_all_shuffles + 1;
        v_time_penalty := 5;  -- -5 seconds
        IF v_all_shuffles <= 1 THEN
            v_points_pct := 0.25;
        ELSE
            v_points_pct := 0.50;
        END IF;
        v_player_shuffles := v_player_shuffles || jsonb_build_object('all', v_all_shuffles);
    ELSIF p_shuffle_type = 'single' THEN
        v_single_shuffles := v_single_shuffles + 1;
        v_time_penalty := 3;  -- -3 seconds
        v_points_pct := 0.25;
        v_player_shuffles := v_player_shuffles || jsonb_build_object('single', v_single_shuffles);
    ELSE
        RETURN json_build_object('success', false, 'error', 'Invalid shuffle type');
    END IF;

    v_total_points := (SELECT COALESCE(SUM(points), 0) FROM links_sprint_words
                       WHERE lobby_code = p_lobby_code AND player_id = p_player_id);
    v_points_deduction := FLOOR(v_total_points * v_points_pct);

    -- Apply point deduction (floor at 0)
    UPDATE players
    SET score = GREATEST(0, COALESCE(score, 0) - v_points_deduction)
    WHERE id = p_player_id AND lobby_code = p_lobby_code;

    -- Update shuffle counts in arena_state
    v_shuffle_counts := v_shuffle_counts || jsonb_build_object(p_player_id::text, v_player_shuffles);

    -- Get existing cumulative deduction for this player
    v_existing_deductions := COALESCE((v_arena_state->'shuffleDeductions'->>(p_player_id::text))::integer, 0);

    -- Build update payload
    v_update_json := jsonb_build_object(
        'shuffleDeductions', COALESCE(v_arena_state->'shuffleDeductions', '{}'::jsonb) ||
            jsonb_build_object(p_player_id::text, v_existing_deductions + v_points_deduction),
        'shuffleCounts', v_shuffle_counts,
        'playerTimers', (
            SELECT jsonb_object_agg(
                id::text,
                GREATEST(0,
                    COALESCE(
                        (COALESCE(v_arena_state->'playerTimers', '{}'::jsonb)->>(id::text))::integer,
                        (v_arena_state->>'waveDuration')::integer
                    ) - CASE WHEN id = p_player_id THEN v_time_penalty ELSE 0 END
                )
            )
            FROM players WHERE lobby_code = p_lobby_code
        ),
        'scores', (
            SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
            FROM players WHERE lobby_code = p_lobby_code
        )
    );

    -- Include new letters if provided
    IF p_new_letters IS NOT NULL THEN
        v_update_json := v_update_json || jsonb_build_object('letters', p_new_letters);
    END IF;

    -- Persist updated state
    UPDATE lobbies
    SET arena_state = COALESCE(arena_state, '{}'::jsonb) || v_update_json
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'PLAYING';

    RETURN json_build_object(
        'success', true,
        'shuffleType', p_shuffle_type,
        'newAllShuffles', v_all_shuffles,
        'newSingleShuffles', v_single_shuffles,
        'pointsDeduction', v_points_deduction,
        'timePenalty', v_time_penalty
    );
END;
$$;

-- ── 3. Re-grant permissions (necessary after CREATE OR REPLACE) ────────────

GRANT EXECUTE ON FUNCTION public.start_links_sprint_wave(TEXT, JSONB, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shuffle_links_sprint_letters(TEXT, UUID, TEXT, JSONB) TO anon, authenticated;
