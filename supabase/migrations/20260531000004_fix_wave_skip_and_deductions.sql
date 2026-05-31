-- ============================================================================
-- Fix: start_links_sprint_wave wave increment + shuffleDeductions preservation
-- ============================================================================
-- Bug 1: wave was always incremented (currentWave+1), skipping wave 1 entirely.
-- Bug 2: shuffleDeductions was reset to '{}' on every wave transition.
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
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    v_current_wave := COALESCE((v_arena_state->>'currentWave')::integer, 1);
    v_total_waves := COALESCE((v_arena_state->>'totalWaves')::integer, 3);
    v_wave_duration := COALESCE((v_arena_state->>'waveDuration')::integer, 60);
    v_current_phase := v_arena_state->>'phase';

    -- FIX: Don't increment wave on the very first call from WAVE_INTRO.
    -- The first call transitions WAVE_INTRO → PLAYING for wave 1.
    -- Subsequent calls from WAVE_RESULTS increment the wave number.
    IF v_current_phase = 'WAVE_INTRO' THEN
        v_new_wave := v_current_wave;   -- Stay on wave 1
    ELSE
        v_new_wave := v_current_wave + 1;  -- Advance to next wave
    END IF;

    IF v_new_wave > v_total_waves THEN
        -- Game over
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
        -- Start wave (first or next)
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
            -- FIX: Preserve cumulative shuffleDeductions across waves (don't reset to {})
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

GRANT EXECUTE ON FUNCTION public.start_links_sprint_wave(TEXT, JSONB, JSONB) TO anon, authenticated;
