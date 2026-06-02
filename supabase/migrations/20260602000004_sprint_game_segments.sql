-- ============================================================================
-- Sprint Letter Shifts: Update start_links_sprint_game to store segments
-- ============================================================================

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
    v_segments_per_wave INTEGER;
    v_segment_duration INTEGER;
    v_existing_state JSONB;
    v_letters TEXT[];
    v_target_words JSONB;
    v_letter_count INTEGER;
BEGIN
    -- Get all players
    SELECT array_agg(id ORDER BY joined_at) INTO v_players
    FROM players
    WHERE lobby_code = p_lobby_code;

    v_player_count := array_length(v_players, 1);

    IF v_players IS NULL OR v_player_count < 2 THEN
        RETURN json_build_object('success', false, 'error', 'Need at least 2 players');
    END IF;

    IF v_player_count > 6 THEN
        RETURN json_build_object('success', false, 'error', 'Maximum 6 players');
    END IF;

    -- Check for existing state (reconnect resilience)
    SELECT arena_state INTO v_existing_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_existing_state IS NOT NULL AND v_existing_state->>'phase' IS NOT NULL
       AND v_existing_state->>'phase' IN ('WAVE_INTRO', 'PLAYING', 'WAVE_RESULTS') THEN
        RETURN json_build_object(
            'success', true,
            'status', 'PLAYING',
            'phase', v_existing_state->>'phase',
            'resumed', true
        );
    END IF;

    -- Settings
    v_waves := COALESCE((p_settings->>'waves')::integer, 3);
    v_wave_duration := COALESCE((p_settings->>'waveDuration')::integer, 60);
    v_segments_per_wave := COALESCE((p_settings->>'segmentsPerWave')::integer, 1);
    v_letter_count := v_player_count;

    -- Calculate segment duration
    IF v_segments_per_wave > 1 THEN
        v_segment_duration := CEIL(v_wave_duration::numeric / v_segments_per_wave)::integer;
    ELSE
        v_segment_duration := v_wave_duration;
    END IF;

    -- Generate initial letters
    v_letters := ARRAY['A','E','R','T','N','S','L','C','O','I','U','D','P','M','H','G','B','F','Y','W','K','V','X','Z','J','Q'];
    v_letters := ARRAY(SELECT unnest(v_letters) ORDER BY random() LIMIT v_letter_count);

    -- Initialize game state with segment support
    UPDATE lobbies
    SET
        status = 'PLAYING',
        mode = 'LINKS_SPRINT',
        settings = COALESCE(settings, '{}'::jsonb) || p_settings,
        arena_state = jsonb_build_object(
            'phase', 'WAVE_INTRO',
            'currentWave', 1,
            'totalWaves', v_waves,
            'currentSegment', 1,
            'segmentsPerWave', v_segments_per_wave,
            'segmentDuration', v_segment_duration,
            'letters', to_jsonb(v_letters),
            'playerLetters', '{}'::jsonb,
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

    RETURN json_build_object(
        'success', true,
        'status', 'PLAYING',
        'phase', 'WAVE_INTRO',
        'player_count', v_player_count,
        'waves', v_waves,
        'segmentsPerWave', v_segments_per_wave,
        'segmentDuration', v_segment_duration,
        'letters', v_letters
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_links_sprint_game(TEXT, JSONB) TO anon, authenticated;
