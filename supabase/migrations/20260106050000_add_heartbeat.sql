-- Add last_seen to players
ALTER TABLE players ADD COLUMN IF NOT EXISTS last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players(last_seen);

-- Update start_arena_session to filter ghosts
CREATE OR REPLACE FUNCTION start_arena_session(p_lobby_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_players UUID[];
    v_first_picker UUID;
BEGIN
    -- Get all ACTIVE players (seen in last 15s) in random order
    SELECT array_agg(id ORDER BY random()) INTO v_players
    FROM players
    WHERE lobby_code = p_lobby_code
      AND last_seen > (NOW() - INTERVAL '15 seconds'); -- Ghost Filter
    
    IF v_players IS NULL OR array_length(v_players, 1) = 0 THEN
         -- Attempt to fall back to ALL players if no one is "active" (e.g. just started)
         -- But technically they should have heartbeated already.
         -- Let's try all players if active list is empty, just to avoid valid-but-slow-start failure?
         -- No, user wants strict filtering.
         RETURN json_build_object('success', false, 'error', 'No active players found. Please wait for players to connect.');
    END IF;

    -- Pick first player
    v_first_picker := v_players[1];

    -- Update lobby status AND initialize arena_state
    UPDATE lobbies 
    SET 
        status = 'PLAYING'::lobby_status,
        arena_state = jsonb_build_object(
            'phase', 'PICKING',
            'pickerId', v_first_picker,
            'activeQuestion', null,
            'revealedQuestions', '[]'::jsonb,
            'timerEndTime', null
        )
    WHERE code = p_lobby_code;
    
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lobby not found');
    END IF;
    
    RETURN json_build_object('success', true, 'status', 'PLAYING', 'pickerId', v_first_picker);
END;
$$;

-- Update next_arena_turn to filter ghosts
CREATE OR REPLACE FUNCTION next_arena_turn(
    p_lobby_code TEXT,
    p_next_picker_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_q_id TEXT;
    v_is_active BOOLEAN;
    v_fallback_picker UUID;
BEGIN
    -- Check if proposed picker is active
    SELECT EXISTS(
        SELECT 1 FROM players 
        WHERE id = p_next_picker_id 
          AND last_seen > (NOW() - INTERVAL '15 seconds')
    ) INTO v_is_active;

    IF NOT v_is_active THEN
        -- Pick a random ACTIVE player as fallback
        SELECT id INTO v_fallback_picker
        FROM players 
        WHERE lobby_code = p_lobby_code
          AND last_seen > (NOW() - INTERVAL '15 seconds')
        ORDER BY random() LIMIT 1;
        
        IF v_fallback_picker IS NOT NULL THEN
            p_next_picker_id := v_fallback_picker;
        END IF;
    END IF;

    SELECT arena_state->'activeQuestion'->>'id' INTO v_old_q_id
    FROM lobbies WHERE code = p_lobby_code;

    UPDATE lobbies
    SET arena_state = (CASE 
        WHEN arena_state IS NULL THEN '{}'::jsonb 
        ELSE arena_state 
    END) 
    || jsonb_build_object(
        'phase', 'PICKING',
        'pickerId', p_next_picker_id,
        'activeQuestion', null,
        'revealedQuestions', (
            COALESCE(arena_state->'revealedQuestions', '[]'::jsonb) 
            || to_jsonb(v_old_q_id)
        ),
        'timerEndTime', null
    )
    WHERE code = p_lobby_code;

    RETURN json_build_object('success', true);
END;
$$;
