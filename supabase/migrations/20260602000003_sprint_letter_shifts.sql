-- ============================================================================
-- Sprint Letter Shifts: Multiple letter pool changes per wave
-- ============================================================================
-- Adds segment support to Sprint waves:
--   • Each wave has N segments (configurable 2-5)
--   • Each segment has its own letters and target words
--   • Used words carry across the entire wave
--   • New RPC: shift_sprint_letters — transitions to next segment
-- ============================================================================

-- ── 1. Update start_links_sprint_wave to store segment config ────────────

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
    v_segments_per_wave INTEGER;
    v_segment_duration INTEGER;
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
    v_segments_per_wave := COALESCE((v_arena_state->>'segmentsPerWave')::integer, 1);
    v_current_phase := v_arena_state->>'phase';

    -- Calculate segment duration (evenly split)
    IF v_segments_per_wave > 1 THEN
        v_segment_duration := CEIL(v_wave_duration::numeric / v_segments_per_wave)::integer;
    ELSE
        v_segment_duration := v_wave_duration;
    END IF;

    -- ═══ Idempotency guard ═══
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
            'currentSegment', 1,
            'segmentsPerWave', v_segments_per_wave,
            'segmentDuration', v_segment_duration,
            'segmentTimerEnd', (extract(epoch from now()) + v_segment_duration)::integer,
            'letters', p_letters,
            'playerLetters', COALESCE(v_player_letters, '{}'::jsonb),
            'targetWords', p_target_words,
            'usedWords', '[]'::jsonb,
            'waveWords', '[]'::jsonb,
            'shuffleCounts', '{}'::jsonb,
            'playerTimers', '{}'::jsonb,
            'shuffleDeductions', COALESCE(v_arena_state->'shuffleDeductions', '{}'::jsonb)
        )
        WHERE code = p_lobby_code AND arena_state->>'phase' != 'PLAYING';
    END IF;

    RETURN json_build_object(
        'success', true,
        'phase', v_new_phase,
        'wave', v_new_wave,
        'segment', 1,
        'segmentsPerWave', v_segments_per_wave,
        'segmentDuration', v_segment_duration
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_links_sprint_wave(TEXT, JSONB, JSONB) TO anon, authenticated;

-- ── 2. New RPC: shift_sprint_letters — transition to next segment ────────

CREATE OR REPLACE FUNCTION public.shift_sprint_letters(
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
    v_current_phase TEXT;
    v_current_segment INTEGER;
    v_segments_per_wave INTEGER;
    v_segment_duration INTEGER;
    v_current_wave INTEGER;
    v_total_waves INTEGER;
    v_wave_duration INTEGER;
    v_used_words JSONB;
    v_player_letters JSONB;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    v_current_phase := v_arena_state->>'phase';

    -- Only valid during PLAYING phase
    IF v_current_phase != 'PLAYING' THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Game is not in playing phase',
            'current_phase', v_current_phase
        );
    END IF;

    v_current_segment := COALESCE((v_arena_state->>'currentSegment')::integer, 1);
    v_segments_per_wave := COALESCE((v_arena_state->>'segmentsPerWave')::integer, 1);
    v_segment_duration := COALESCE((v_arena_state->>'segmentDuration')::integer, 60);
    v_current_wave := COALESCE((v_arena_state->>'currentWave')::integer, 1);
    v_total_waves := COALESCE((v_arena_state->>'totalWaves')::integer, 3);
    v_wave_duration := COALESCE((v_arena_state->>'waveDuration')::integer, 60);

    -- Preserve used words across segments
    v_used_words := COALESCE(v_arena_state->'usedWords', '[]'::jsonb);

    -- Check if this is the last segment
    IF v_current_segment >= v_segments_per_wave THEN
        -- Last segment — end the wave (transition to WAVE_INTRO or GAME_OVER)
        DECLARE
            v_target_reveals JSONB;
            v_targets JSONB;
            v_next_phase TEXT;
        BEGIN
            v_targets := COALESCE(v_arena_state->'targetWords', '[]'::jsonb);
            v_target_reveals := COALESCE(v_arena_state->'targetReveals', '[]'::jsonb);

            IF v_current_wave >= v_total_waves THEN
                v_next_phase := 'GAME_OVER';
            ELSE
                v_next_phase := 'WAVE_INTRO';
            END IF;

            UPDATE lobbies
            SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
                'phase', v_next_phase,
                'currentWave', CASE WHEN v_next_phase = 'WAVE_INTRO' THEN v_current_wave + 1 ELSE v_current_wave END,
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
                'wave', v_current_wave,
                'segment', v_current_segment,
                'waveEnded', true
            );
        END;
    END IF;

    -- Not the last segment — shift to next segment
    SELECT jsonb_object_agg(id::text, p_letters)
    INTO v_player_letters
    FROM players WHERE lobby_code = p_lobby_code;

    UPDATE lobbies
    SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
        'currentSegment', v_current_segment + 1,
        'segmentTimerEnd', (extract(epoch from now()) + v_segment_duration)::integer,
        'letters', p_letters,
        'playerLetters', COALESCE(v_player_letters, '{}'::jsonb),
        'targetWords', p_target_words,
        'usedWords', v_used_words  -- preserve used words across segments
    )
    WHERE code = p_lobby_code AND arena_state->>'phase' = 'PLAYING';

    RETURN json_build_object(
        'success', true,
        'phase', 'PLAYING',
        'wave', v_current_wave,
        'segment', v_current_segment + 1,
        'segmentsPerWave', v_segments_per_wave,
        'segmentDuration', v_segment_duration,
        'waveEnded', false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.shift_sprint_letters(TEXT, JSONB, JSONB) TO anon, authenticated;
