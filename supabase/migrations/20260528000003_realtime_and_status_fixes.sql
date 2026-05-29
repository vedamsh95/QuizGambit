-- Migration: Realtime publication + last_seen fixes for simultaneous mode
-- ============================================================================

-- 1. Add simultaneous_answers to supabase_realtime publication
--    This enables postgres_changes delivery for answer events
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.simultaneous_answers;
EXCEPTION
    WHEN duplicate_object THEN NULL; -- already added
END;
$$;

-- 2. Fix start_simultaneous_session: count ALL lobby players (not just heartbeat-active)
--    This mirrors the same fix from 20260126000000_fix_stuck_answers.sql for arena mode
CREATE OR REPLACE FUNCTION public.start_simultaneous_session(
    p_lobby_code TEXT,
    p_settings JSONB DEFAULT '{}'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_players UUID[];
    v_first_picker UUID;
    v_existing_state JSONB;
BEGIN
    -- Get ALL players in lobby (not filtered by last_seen)
    SELECT array_agg(id ORDER BY random()) INTO v_players
    FROM public.players
    WHERE lobby_code = p_lobby_code;

    IF v_players IS NULL OR array_length(v_players, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No active players found');
    END IF;

    v_first_picker := v_players[1];

    -- Check if arena_state already exists (reconnect resilience)
    SELECT arena_state INTO v_existing_state
    FROM public.lobbies WHERE code = p_lobby_code;

    -- If game already in progress, return current state
    IF v_existing_state IS NOT NULL AND v_existing_state->>'phase' IS NOT NULL
       AND v_existing_state->>'phase' NOT IN ('GAME_OVER') THEN
        RETURN json_build_object(
            'success', true, 
            'status', 'PLAYING', 
            'pickerId', v_existing_state->>'pickerId',
            'resumed', true
        );
    END IF;

    -- Initialize game state
    UPDATE public.lobbies
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
