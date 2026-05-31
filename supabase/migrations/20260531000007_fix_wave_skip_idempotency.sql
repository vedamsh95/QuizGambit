-- ============================================================================
-- Fix: start_links_sprint_wave idempotency — prevent double-call wave skip
-- ============================================================================
-- Bug: When host double-clicks "Start Wave N" button (or realtime delay causes
--      two calls), start_links_sprint_wave sees phase=PLAYING (set by first call)
--      and increments currentWave again, skipping a wave entirely.
--
-- Fix: If phase is already PLAYING with currentWave set, don't increment.
--      This makes the function truly idempotent for concurrent calls.
-- ============================================================================

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

    -- ═══ Idempotency guard: phase is already PLAYING — someone beat us ═══
    -- This prevents double-click on "Start Wave" button from skipping a wave.
    -- The first call already transitioned from WAVE_RESULTS/WAVE_INTRO → PLAYING.
    -- The second call would have incremented currentWave again (skipping a wave).
    IF v_current_phase = 'PLAYING' THEN
        RETURN json_build_object(
            'success', true,
            'phase', 'PLAYING',
            'wave', v_current_wave,
            'idempotent', true
        );
    END IF;

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
            'currentWave', v_new_wave,
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
        WHERE code = p_lobby_code AND arena_state->>'phase' != 'PLAYING';  -- extra guard
    END IF;

    RETURN json_build_object(
        'success', true,
        'phase', v_new_phase,
        'wave', v_new_wave
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_links_sprint_wave(TEXT, JSONB, JSONB) TO anon, authenticated;
