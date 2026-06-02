-- ============================================================================
-- Sprint Continuous Flow: end wave → WAVE_INTRO (not WAVE_RESULTS)
-- ============================================================================
-- Eliminates the dead-stop WAVE_RESULTS phase. After PLAYING ends:
--   • If more waves remain → transition to WAVE_INTRO (client auto-starts)
--   • If final wave → transition to GAME_OVER
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
    v_total_waves INTEGER;
    v_target_reveals JSONB;
    v_already_ended BOOLEAN := false;
    v_next_phase TEXT;
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
    v_total_waves := COALESCE((v_arena_state->>'totalWaves')::integer, 3);
    v_targets := COALESCE(v_arena_state->'targetWords', '[]'::jsonb);

    -- Idempotency: check if this wave already has a targetReveals entry
    v_target_reveals := COALESCE(v_arena_state->'targetReveals', '[]'::jsonb);
    FOR i IN 0..jsonb_array_length(v_target_reveals) - 1 LOOP
        IF (v_target_reveals->i->>'wave')::integer = v_current_wave THEN
            v_already_ended := true;
            EXIT;
        END IF;
    END LOOP;

    -- Determine next phase: WAVE_INTRO if more waves, GAME_OVER if final
    IF v_current_wave >= v_total_waves THEN
        v_next_phase := 'GAME_OVER';
    ELSE
        v_next_phase := 'WAVE_INTRO';
    END IF;

    IF v_already_ended THEN
        -- Wave already ended — just sync phase
        UPDATE lobbies
        SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', v_next_phase,
            'currentWave', v_current_wave,
            'letters', '[]'::jsonb,
            'playerLetters', '{}'::jsonb,
            'scores', (
                SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
                FROM players WHERE lobby_code = p_lobby_code
            )
        )
        WHERE code = p_lobby_code;

        RETURN json_build_object(
            'success', true,
            'phase', v_next_phase,
            'wave', v_current_wave,
            'already_ended', true
        );
    END IF;

    -- Normal path: end the wave and record target reveals
    UPDATE lobbies
    SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
        'phase', v_next_phase,
        'currentWave', v_current_wave,
        'letters', '[]'::jsonb,
        'playerLetters', '{}'::jsonb,
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
        'phase', v_next_phase,
        'wave', v_current_wave
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_links_sprint_wave(TEXT) TO anon, authenticated;
