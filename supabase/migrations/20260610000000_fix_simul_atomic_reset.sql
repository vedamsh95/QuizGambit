-- ============================================================================
-- Atomic Reset and Start for Simultaneous Mode
-- Fixes race conditions and stale state bugs when restarting a game
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_and_start_simultaneous_session(
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
    v_first_picker UUID;
BEGIN
    -- 1. Gather players
    SELECT array_agg(id ORDER BY random()) INTO v_players
    FROM public.players
    WHERE lobby_code = p_lobby_code;

    IF v_players IS NULL OR array_length(v_players, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No active players found');
    END IF;

    v_first_picker := v_players[1];

    -- 2. Nuke old answers from previous game
    DELETE FROM public.simultaneous_answers WHERE lobby_code = p_lobby_code;
    DELETE FROM public.arena_answers WHERE lobby_code = p_lobby_code;

    -- 3. Reset all player scores to 0 for the new game
    UPDATE public.players SET score = 0 WHERE lobby_code = p_lobby_code;

    -- 4. Atomically update the lobby: clear old state, set new state and settings
    UPDATE public.lobbies
    SET
        status = 'PLAYING',
        mode = 'SIMULTANEOUS',
        settings = (COALESCE(settings, '{}'::jsonb)
            - 'revealed_questions'
            - 'revealed_questions_by_round'
            - 'draftPicks'
            - 'simultaneous_categories') || p_settings,
        arena_state = jsonb_build_object(
            'phase', 'PICKING',
            'pickerId', v_first_picker,
            'lastPickerId', v_first_picker,
            'activeQuestion', null,
            'revealed_questions_by_round', jsonb_build_object('1', '[]'::jsonb),
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
