-- ============================================================================
-- Fix: end_links_sprint_wave idempotency + explicit currentWave preservation
-- ============================================================================
-- Bug 1: currentWave was not explicitly written — relied on || merge which
--        could be corrupted by concurrent arena_state mutations (e.g. shuffle).
-- Bug 2: No idempotency guard — if called twice for same wave (realtime
--        delay + polling race), targetReveals would duplicate entries.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.end_links_sprint_wave(
    p_lobby_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_targets JSONB;
    v_current_wave INTEGER;
    v_target_reveals JSONB;
    v_already_ended BOOLEAN := false;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Game is not in playing phase',
            'current_phase', v_arena_state->>'phase'
        );
    END IF;

    v_current_wave := COALESCE((v_arena_state->>'currentWave')::integer, 1);
    v_targets := COALESCE(v_arena_state->'targetWords', '[]'::jsonb);

    -- Idempotency: check if this wave already has a targetReveals entry
    v_target_reveals := COALESCE(v_arena_state->'targetReveals', '[]'::jsonb);
    FOR i IN 0..jsonb_array_length(v_target_reveals) - 1 LOOP
        IF (v_target_reveals->i->>'wave')::integer = v_current_wave THEN
            v_already_ended := true;
            EXIT;
        END IF;
    END LOOP;

    IF v_already_ended THEN
        -- Wave already ended — don't duplicate targetReveals, just sync phase
        UPDATE lobbies
        SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', 'WAVE_RESULTS',
            'currentWave', v_current_wave,
            'scores', (
                SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
                FROM players WHERE lobby_code = p_lobby_code
            )
        )
        WHERE code = p_lobby_code;

        RETURN json_build_object(
            'success', true,
            'phase', 'WAVE_RESULTS',
            'wave', v_current_wave,
            'already_ended', true
        );
    END IF;

    -- Normal path: end the wave and record target reveals
    UPDATE lobbies
    SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
        'phase', 'WAVE_RESULTS',
        'currentWave', v_current_wave,  -- explicit preservation
        'targetReveals', v_target_reveals || jsonb_build_object(
            'wave', v_current_wave,
            'targets', v_targets
        ),
        'scores', (
            SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
            FROM players WHERE lobby_code = p_lobby_code
        )
    )
    WHERE code = p_lobby_code AND arena_state->>'phase' = 'PLAYING';

    RETURN json_build_object(
        'success', true,
        'phase', 'WAVE_RESULTS',
        'wave', v_current_wave
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_links_sprint_wave(TEXT) TO anon, authenticated;
