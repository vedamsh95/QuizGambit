-- ============================================================================
-- LINKS Classic Improvements:
--   1. Auto letter selection for > 2 players (skip LETTER_SELECT)
--   2. Poison 1:1 random assignment (each player poisons ONE opponent)
--   3. Support configurable letter count (2 or 3) for auto-selection
--   4. FIX: Use playerTimers (per-player map) instead of timerEndTime (single)
--   5. FIX: Reset player scores & clear links_words on fresh game start
-- ============================================================================

-- ── 1. Updated start_links_game: auto-pick letters for > 2 players ─────────

CREATE OR REPLACE FUNCTION public.start_links_game(
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
    v_player_letters JSONB := '{}'::jsonb;
    v_all_letters TEXT[];
    v_existing_state JSONB;
    v_letter_count INTEGER;
    v_alphabet TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    v_picked_letters TEXT[] := '{}';
    v_i INTEGER;
    v_rand_idx INTEGER;
    v_poison_pairings JSONB := '{}'::jsonb;
    v_shuffled_players UUID[];
    v_j INTEGER;
    v_assigner UUID;
    v_target UUID;
    v_player_timers JSONB;
    v_player_timer_counts JSONB;
    v_now DOUBLE PRECISION;
    v_player_record RECORD;
BEGIN
    -- Get all players in random order
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
       AND v_existing_state->>'phase' IN ('LETTER_SELECT', 'POISON_SETUP', 'PLAYING') THEN
        RETURN json_build_object(
            'success', true,
            'status', 'PLAYING',
            'phase', v_existing_state->>'phase',
            'resumed', true
        );
    END IF;

    -- ── Reset old game data for fresh starts (AFTER reconnect check) ──
    UPDATE players SET score = 0 WHERE lobby_code = p_lobby_code;
    DELETE FROM links_words WHERE lobby_code = p_lobby_code;

    -- ── Determine letter count from settings (default 2 for > 2 players, otherwise per-player) ──
    v_letter_count := COALESCE((p_settings->>'linksLetterCount')::integer, 2);
    IF v_letter_count < 2 THEN v_letter_count := 2; END IF;
    IF v_letter_count > 3 THEN v_letter_count := 3; END IF;

    -- ── Phase determination ──────────────────────────────────────────────
    IF v_player_count <= 2 THEN
        -- ── 2 players: normal LETTER_SELECT phase ─────────────────────
        UPDATE lobbies
        SET
            status = 'PLAYING',
            mode = 'LINKS',
            settings = COALESCE(settings, '{}'::jsonb) || p_settings,
            arena_state = jsonb_build_object(
                'phase', 'LETTER_SELECT',
                'letters', '[]'::jsonb,
                'playerLetters', '{}'::jsonb,
                'poisonLetters', '{}'::jsonb,
                'playerHearts', jsonb_build_object(),
                'usedWords', '[]'::jsonb,
                'scores', jsonb_build_object(),
                'playerTimers', '{}'::jsonb,
                'playerTimerCounts', '{}'::jsonb,
                'poisonEnabled', COALESCE((p_settings->>'poisonEnabled')::boolean, true),
                'roundDuration', COALESCE((p_settings->>'roundDuration')::integer, 60),
                'linksLetterCount', v_letter_count
            )
        WHERE code = p_lobby_code;

        RETURN json_build_object(
            'success', true,
            'status', 'PLAYING',
            'phase', 'LETTER_SELECT',
            'player_count', v_player_count,
            'auto_letters', false
        );
    ELSE
        -- ── > 2 players: computer auto-picks letters ──────────────────

        -- Randomly pick v_letter_count letters from alphabet
        FOR v_i IN 1..v_letter_count LOOP
            LOOP
                v_rand_idx := floor(random() * 26)::int + 1;
                IF NOT (v_alphabet[v_rand_idx] = ANY(v_picked_letters)) THEN
                    v_picked_letters := array_append(v_picked_letters, v_alphabet[v_rand_idx]);
                    EXIT;
                END IF;
            END LOOP;
        END LOOP;

        -- Sort for display
        SELECT array_agg(letter ORDER BY letter) INTO v_all_letters
        FROM unnest(v_picked_letters) AS letter;

        -- ── Generate random 1:1 poison pairings (circular shuffle) ────
        -- Shuffle players randomly
        SELECT array_agg(id) INTO v_shuffled_players
        FROM (
            SELECT id FROM players WHERE lobby_code = p_lobby_code ORDER BY random()
        ) sub;

        -- Create circular 1:1 pairings (each poisons the next in the circle)
        FOR v_i IN 1..v_player_count LOOP
            v_assigner := v_shuffled_players[v_i];
            v_target := v_shuffled_players[CASE WHEN v_i = v_player_count THEN 1 ELSE v_i + 1 END];

            v_poison_pairings := v_poison_pairings || jsonb_build_object(
                v_assigner::text, jsonb_build_object(
                    'target', v_target::text,
                    'letter', '' -- will be filled during POISON_SETUP
                )
            );
        END LOOP;

        -- Store poison pairings in poisonLetters (reusing the structure)
        -- poisonLetters will hold: { assignerId: { targetId: letter } }
        -- But we need a different structure: { assignerId: { target: targetId, letter: "" } }
        -- Let's use a separate key: poisonPairings

        -- Determine next phase
        DECLARE
            v_poison_enabled BOOLEAN := COALESCE((p_settings->>'poisonEnabled')::boolean, true);
            v_next_phase TEXT;
        BEGIN
            v_next_phase := CASE WHEN v_poison_enabled THEN 'POISON_SETUP' ELSE 'PLAYING' END;

            -- Initialize per-player timers if going straight to PLAYING
            v_player_timers := '{}'::jsonb;
            v_player_timer_counts := '{}'::jsonb;
            IF v_next_phase = 'PLAYING' THEN
                v_now := extract(epoch from now());
                FOR v_player_record IN
                    SELECT id FROM players WHERE lobby_code = p_lobby_code
                LOOP
                    v_player_timers := v_player_timers || jsonb_build_object(
                        v_player_record.id::text, v_now + COALESCE((p_settings->>'roundDuration')::integer, 60)
                    );
                    v_player_timer_counts := v_player_timer_counts || jsonb_build_object(
                        v_player_record.id::text, 0
                    );
                END LOOP;
            END IF;

            UPDATE lobbies
            SET
                status = 'PLAYING',
                mode = 'LINKS',
                settings = COALESCE(settings, '{}'::jsonb) || p_settings,
                arena_state = jsonb_build_object(
                    'phase', v_next_phase,
                    'letters', to_jsonb(v_all_letters),
                    'playerLetters', '{}'::jsonb,
                    'poisonLetters', '{}'::jsonb,
                    'poisonPairings', v_poison_pairings,
                    'playerHearts', jsonb_build_object(),
                    'usedWords', '[]'::jsonb,
                    'scores', jsonb_build_object(),
                    'playerTimers', v_player_timers,
                    'playerTimerCounts', v_player_timer_counts,
                    'poisonEnabled', v_poison_enabled,
                    'roundDuration', COALESCE((p_settings->>'roundDuration')::integer, 60),
                    'linksLetterCount', v_letter_count,
                    'autoLetters', true
                )
            WHERE code = p_lobby_code;
        END;

        IF NOT FOUND THEN
            RETURN json_build_object('success', false, 'error', 'Lobby not found');
        END IF;

        RETURN json_build_object(
            'success', true,
            'status', 'PLAYING',
            'phase', CASE WHEN COALESCE((p_settings->>'poisonEnabled')::boolean, true) THEN 'POISON_SETUP' ELSE 'PLAYING' END,
            'player_count', v_player_count,
            'auto_letters', true,
            'letters', v_all_letters,
            'letter_count', v_letter_count
        );
    END IF;
END;
$$;

-- ── 2. Updated assign_links_poison: 1:1 random assignment ─────────────────

CREATE OR REPLACE FUNCTION public.assign_links_poison(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_poison_map JSONB  -- { "targetPlayerId": "X" } — now single entry for > 2 players
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_poison_letters JSONB;
    v_player_letters JSONB;
    v_player_count INTEGER;
    v_assigned_count INTEGER;
    v_all_letters TEXT[];
    v_target_id TEXT;
    v_target_letter TEXT;
    v_poison_letter TEXT;
    v_poison_pairings JSONB;
    v_my_pairing JSONB;
    v_is_auto_mode BOOLEAN;
    v_player_timers JSONB;
    v_player_timer_counts JSONB;
    v_now DOUBLE PRECISION;
    v_player_record RECORD;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'POISON_SETUP' THEN
        RETURN json_build_object('success', false, 'error', 'Not in poison setup phase');
    END IF;

    v_is_auto_mode := COALESCE((v_arena_state->>'autoLetters')::boolean, false);
    v_player_letters := COALESCE(v_arena_state->'playerLetters', '{}'::jsonb);
    v_poison_pairings := COALESCE(v_arena_state->'poisonPairings', '{}'::jsonb);

    -- ── Auto mode (> 2 players): validate against pre-generated pairings ──
    IF v_is_auto_mode THEN
        v_my_pairing := v_poison_pairings->p_player_id::text;

        IF v_my_pairing IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'No poison assignment found for you');
        END IF;

        -- Must provide exactly one poison entry matching the assigned target
        IF jsonb_typeof(p_poison_map) != 'object' OR jsonb_array_length(
            (SELECT jsonb_agg(key) FROM jsonb_object_keys(p_poison_map) AS key)
        ) IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'Must provide one poison assignment');
        END IF;

        -- Count entries
        DECLARE
            v_entry_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO v_entry_count FROM jsonb_each(p_poison_map);
            IF v_entry_count != 1 THEN
                RETURN json_build_object('success', false, 'error', 'Assign poison to exactly one opponent');
            END IF;
        END;

        -- Validate the target matches the assigned pairing
        v_target_id := (SELECT key FROM jsonb_each(p_poison_map) LIMIT 1);
        IF v_target_id != v_my_pairing->>'target' THEN
            RETURN json_build_object('success', false, 'error', 'Poison must be assigned to your designated target');
        END IF;

        v_poison_letter := upper(trim(p_poison_map->>v_target_id));
        IF v_poison_letter !~ '^[A-Z]$' THEN
            RETURN json_build_object('success', false, 'error', 'Invalid poison letter — must be A-Z');
        END IF;

        -- Store the poison letter in poisonLetters (existing structure)
        v_poison_letters := COALESCE(v_arena_state->'poisonLetters', '{}'::jsonb);
        v_poison_letters := v_poison_letters || jsonb_build_object(
            p_player_id::text, jsonb_build_object(v_target_id, v_poison_letter)
        );

        -- Update the pairing with the chosen letter
        v_poison_pairings := v_poison_pairings || jsonb_build_object(
            p_player_id::text, jsonb_build_object(
                'target', v_target_id,
                'letter', v_poison_letter
            )
        );

        -- Count how many players have assigned their poison
        SELECT COUNT(*) INTO v_player_count
        FROM players WHERE lobby_code = p_lobby_code;

        SELECT COUNT(*) INTO v_assigned_count
        FROM jsonb_each(v_poison_letters) AS kv;

        -- Check if all players have assigned poisons → PLAYING
        IF v_assigned_count >= v_player_count THEN
            -- Initialize per-player timers
            v_now := extract(epoch from now());
            v_player_timers := '{}'::jsonb;
            v_player_timer_counts := '{}'::jsonb;

            FOR v_player_record IN
                SELECT id FROM players WHERE lobby_code = p_lobby_code
            LOOP
                v_player_timers := v_player_timers || jsonb_build_object(
                    v_player_record.id::text, v_now + COALESCE((v_arena_state->>'roundDuration')::integer, 60)
                );
                v_player_timer_counts := v_player_timer_counts || jsonb_build_object(
                    v_player_record.id::text, 0
                );
            END LOOP;

            UPDATE lobbies
            SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
                'phase', 'PLAYING',
                'poisonLetters', v_poison_letters,
                'poisonPairings', v_poison_pairings,
                'playerHearts', (
                    SELECT jsonb_object_agg(id::text, 3)
                    FROM players WHERE lobby_code = p_lobby_code
                ),
                'playerTimers', v_player_timers,
                'playerTimerCounts', v_player_timer_counts,
                'gameStartTime', extract(epoch from now()) * 1000
            )
            WHERE code = p_lobby_code
              AND arena_state->>'phase' = 'POISON_SETUP';

            RETURN json_build_object(
                'success', true,
                'phase', 'PLAYING',
                'all_assigned', true,
                'auto_mode', true
            );
        ELSE
            UPDATE lobbies
            SET arena_state = jsonb_set(
                COALESCE(arena_state, '{}'::jsonb),
                '{poisonLetters}',
                v_poison_letters
            ) || jsonb_build_object('poisonPairings', v_poison_pairings)
            WHERE code = p_lobby_code
              AND arena_state->>'phase' = 'POISON_SETUP';

            RETURN json_build_object(
                'success', true,
                'phase', 'POISON_SETUP',
                'all_assigned', false,
                'assigned_count', v_assigned_count,
                'player_count', v_player_count,
                'auto_mode', true
            );
        END IF;
    END IF;

    -- ── Fallback: original 2-player poison logic ───────────────────────
    -- Validate poison assignments
    FOR v_target_id, v_poison_letter IN
        SELECT key, value::text FROM jsonb_each_text(p_poison_map)
    LOOP
        -- Can't poison yourself
        IF v_target_id = p_player_id::text THEN
            RETURN json_build_object('success', false, 'error', 'Cannot assign poison to yourself');
        END IF;

        -- Target must be a player
        IF NOT v_player_letters ? v_target_id THEN
            RETURN json_build_object('success', false, 'error', 'Invalid target player');
        END IF;

        -- Poison must be a valid letter
        IF upper(v_poison_letter) !~ '^[A-Z]$' THEN
            RETURN json_build_object('success', false, 'error', 'Invalid poison letter');
        END IF;
    END LOOP;

    -- Record poison assignments
    v_poison_letters := COALESCE(v_arena_state->'poisonLetters', '{}'::jsonb);
    v_poison_letters := v_poison_letters || jsonb_build_object(p_player_id::text, p_poison_map);

    -- Count assignments
    SELECT COUNT(*) INTO v_player_count
    FROM players WHERE lobby_code = p_lobby_code;

    SELECT COUNT(*) INTO v_assigned_count
    FROM jsonb_each_text(v_poison_letters) AS kv;

    -- Check if all players have assigned poisons → PLAYING
    IF v_assigned_count >= v_player_count THEN
        -- Initialize per-player timers
        v_now := extract(epoch from now());
        v_player_timers := '{}'::jsonb;
        v_player_timer_counts := '{}'::jsonb;

        FOR v_player_record IN
            SELECT id FROM players WHERE lobby_code = p_lobby_code
        LOOP
            v_player_timers := v_player_timers || jsonb_build_object(
                v_player_record.id::text, v_now + COALESCE((v_arena_state->>'roundDuration')::integer, 60)
            );
            v_player_timer_counts := v_player_timer_counts || jsonb_build_object(
                v_player_record.id::text, 0
            );
        END LOOP;

        UPDATE lobbies
        SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', 'PLAYING',
            'poisonLetters', v_poison_letters,
            'playerHearts', (
                SELECT jsonb_object_agg(id::text, 3)
                FROM players WHERE lobby_code = p_lobby_code
            ),
            'playerTimers', v_player_timers,
            'playerTimerCounts', v_player_timer_counts,
            'gameStartTime', extract(epoch from now()) * 1000
        )
        WHERE code = p_lobby_code
          AND arena_state->>'phase' = 'POISON_SETUP';

        RETURN json_build_object(
            'success', true,
            'phase', 'PLAYING',
            'all_assigned', true
        );
    ELSE
        UPDATE lobbies
        SET arena_state = jsonb_set(
            COALESCE(arena_state, '{}'::jsonb),
            '{poisonLetters}',
            v_poison_letters
        )
        WHERE code = p_lobby_code
          AND arena_state->>'phase' = 'POISON_SETUP';

        RETURN json_build_object(
            'success', true,
            'phase', 'POISON_SETUP',
            'all_assigned', false,
            'assigned_count', v_assigned_count,
            'player_count', v_player_count
        );
    END IF;
END;
$$;

-- ── 3. Grant permissions ───────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.start_links_game(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_links_poison(TEXT, UUID, JSONB) TO anon, authenticated;
