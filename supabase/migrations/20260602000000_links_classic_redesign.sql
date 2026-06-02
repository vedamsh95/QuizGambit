-- ============================================================================
-- LINKS Classic Redesign
-- ============================================================================
-- New gameplay:
--   - Host picks a letter variant (2-6 letters)
--   - ALL player counts (2-6) go through LETTER_SELECT phase
--   - Each player picks multiple letters (variant ÷ player_count)
--   - Each letter can be picked max 2 times across all players (3-6 variants)
--   - 2-letter variant: no duplication limit
--   - Min word length: 2 characters
--   - Word must contain at least 2 letters from the pool
--   - NEW: Pool letter multiplier — using more unique pool letters = higher multiplier
--     2 pool letters used → 1.0×  (no bonus)
--     3 pool letters used → 1.5×
--     4 pool letters used → 2.0×
--     5 pool letters used → 2.5×
--     6 pool letters used → 3.0×
-- ============================================================================

-- ── 0. Add new columns to links_words ──────────────────────────────────────

ALTER TABLE public.links_words
    ADD COLUMN IF NOT EXISTS pool_letters_used INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pool_multiplier NUMERIC DEFAULT 1.0;

-- ── 1. Updated start_links_game ─────────────────────────────────────────────

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
    v_existing_state JSONB;
    v_variant INTEGER;         -- total letters in the pool (2-6)
    v_letters_per_player INTEGER;
    v_pick_limit INTEGER;      -- max times a letter can be picked (2 for variants >=3, unlimited for variant 2)
    v_poison_pairings JSONB := '{}'::jsonb;
    v_shuffled_players UUID[];
    v_i INTEGER;
    v_assigner UUID;
    v_target UUID;
    v_poison_enabled BOOLEAN;
    v_round_duration INTEGER;
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
       AND v_existing_state->>'phase' IN ('LETTER_SELECT', 'POISON_SETUP', 'PLAYING') THEN
        RETURN json_build_object(
            'success', true,
            'status', 'PLAYING',
            'phase', v_existing_state->>'phase',
            'resumed', true
        );
    END IF;

    -- Reset old game data
    UPDATE players SET score = 0 WHERE lobby_code = p_lobby_code;
    DELETE FROM links_words WHERE lobby_code = p_lobby_code;

    -- ── Determine variant from settings ──
    v_variant := COALESCE((p_settings->>'linksLetterCount')::integer, 3);

    -- Validate variant is available for this player count
    -- Available variants must be divisible by player_count OR player_count divisible by variant
    -- (so letters distribute evenly)    IF v_variant < 2 THEN v_variant := 2; END IF;
    IF v_variant > 6 THEN v_variant := 6; END IF;

    -- Calculate letters per player (each picks ceil to ensure enough total picks)
    v_letters_per_player := CEIL(v_variant::numeric / v_player_count)::integer;
    IF v_letters_per_player < 1 THEN v_letters_per_player := 1; END IF;

    -- Pick limit: 2 for variants >= 3, unlimited (99) for variant 2
    v_pick_limit := CASE WHEN v_variant >= 3 THEN 2 ELSE 99 END;

    v_poison_enabled := COALESCE((p_settings->>'poisonEnabled')::boolean, true);
    v_round_duration := COALESCE((p_settings->>'roundDuration')::integer, 60);

    -- ── Generate poison pairings (same as before) ──
    SELECT array_agg(id) INTO v_shuffled_players
    FROM (
        SELECT id FROM players WHERE lobby_code = p_lobby_code ORDER BY random()
    ) sub;

    FOR v_i IN 1..v_player_count LOOP
        v_assigner := v_shuffled_players[v_i];
        v_target := v_shuffled_players[CASE WHEN v_i = v_player_count THEN 1 ELSE v_i + 1 END];
        v_poison_pairings := v_poison_pairings || jsonb_build_object(
            v_assigner::text, jsonb_build_object(
                'target', v_target::text,
                'letter', ''
            )
        );
    END LOOP;

    -- ── ALL player counts now go through LETTER_SELECT ──
    UPDATE lobbies
    SET
        status = 'PLAYING',
        mode = 'LINKS',
        settings = COALESCE(settings, '{}'::jsonb) || p_settings,
        arena_state = jsonb_build_object(
            'phase', 'LETTER_SELECT',
            'letters', '[]'::jsonb,
            'playerLetters', '{}'::jsonb,     -- { playerId: [letter1, letter2, ...] }
            'letterPickCounts', '{}'::jsonb,   -- { "A": 1, "B": 2, ... }
            'poisonLetters', '{}'::jsonb,
            'poisonPairings', v_poison_pairings,
            'playerHearts', jsonb_build_object(),
            'usedWords', '[]'::jsonb,
            'scores', jsonb_build_object(),
            'playerTimers', '{}'::jsonb,
            'playerTimerCounts', '{}'::jsonb,
            'poisonEnabled', v_poison_enabled,
            'roundDuration', v_round_duration,
            'linksLetterCount', v_variant,
            'lettersPerPlayer', v_letters_per_player,
            'letterPickLimit', v_pick_limit,
            'autoLetters', false
        )
    WHERE code = p_lobby_code;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lobby not found');
    END IF;

    RETURN json_build_object(
        'success', true,
        'status', 'PLAYING',
        'phase', 'LETTER_SELECT',
        'player_count', v_player_count,
        'variant', v_variant,
        'letters_per_player', v_letters_per_player,
        'pick_limit', v_pick_limit
    );
END;
$$;

-- ── 2. Updated select_links_letter (multi-pick support) ─────────────────────

CREATE OR REPLACE FUNCTION public.select_links_letter(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_letter TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_player_letters JSONB;       -- { playerId: [letter1, letter2, ...] }
    v_letter_pick_counts JSONB;   -- { "A": 1, "B": 2, ... }
    v_all_letters TEXT[];
    v_player_count INTEGER;
    v_selected_count INTEGER;
    v_new_phase TEXT;
    v_letters_per_player INTEGER;
    v_pick_limit INTEGER;
    v_my_letters JSONB;
    v_current_pick_count INTEGER;
    v_letter_count INTEGER;
    v_player_record RECORD;
    v_computer_letters TEXT[];
    v_alphabet TEXT[] := ARRAY['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
    v_rand_idx INTEGER;
    v_variant INTEGER;
    v_needed INTEGER;
    v_now DOUBLE PRECISION;
    v_player_timers JSONB;
    v_player_timer_counts JSONB;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'LETTER_SELECT' THEN
        RETURN json_build_object('success', false, 'error', 'Not in letter selection phase');
    END IF;

    -- Validate letter
    p_letter := upper(trim(p_letter));
    IF p_letter !~ '^[A-Z]$' THEN
        RETURN json_build_object('success', false, 'error', 'Invalid letter — must be A-Z');
    END IF;

    v_player_letters := COALESCE(v_arena_state->'playerLetters', '{}'::jsonb);
    v_letter_pick_counts := COALESCE(v_arena_state->'letterPickCounts', '{}'::jsonb);
    v_letters_per_player := COALESCE((v_arena_state->>'lettersPerPlayer')::integer, 1);
    v_pick_limit := COALESCE((v_arena_state->>'letterPickLimit')::integer, 2);
    v_variant := COALESCE((v_arena_state->>'linksLetterCount')::integer, 3);

    -- Check player hasn't exceeded their pick limit
    v_my_letters := COALESCE(v_player_letters->>p_player_id::text, '[]')::jsonb;
    v_current_pick_count := jsonb_array_length(v_my_letters);

    IF v_current_pick_count >= v_letters_per_player THEN
        RETURN json_build_object('success', false, 'error', 'You have already picked all your letters');
    END IF;

    -- Check player hasn't already picked this letter
    DECLARE
        v_existing TEXT;
    BEGIN
        FOR v_existing IN SELECT jsonb_array_elements_text(v_my_letters)
        LOOP
            IF v_existing = p_letter THEN
                RETURN json_build_object('success', false, 'error', 'You already picked this letter');
            END IF;
        END LOOP;
    END;

    -- Check letter pick count (max 2 for variants >= 3)
    v_letter_count := COALESCE((v_letter_pick_counts->>p_letter)::integer, 0);
    IF v_letter_count >= v_pick_limit THEN
        RETURN json_build_object('success', false, 'error', 'Letter "' || p_letter || '" has been picked the maximum number of times');
    END IF;

    -- Record selection
    v_my_letters := v_my_letters || to_jsonb(p_letter);
    v_player_letters := v_player_letters || jsonb_build_object(p_player_id::text, v_my_letters);

    -- Update letter pick count
    v_letter_pick_counts := v_letter_pick_counts || jsonb_build_object(p_letter, v_letter_count + 1);

    -- ── Check if all players have picked their letters ──
    SELECT COUNT(*) INTO v_player_count
    FROM players WHERE lobby_code = p_lobby_code;

    -- Count total letter picks across all players
    v_selected_count := 0;
    DECLARE
        v_pid TEXT;
        v_picks JSONB;
    BEGIN
        FOR v_pid, v_picks IN SELECT key, value FROM jsonb_each(v_player_letters)
        LOOP
            v_selected_count := v_selected_count + jsonb_array_length(v_picks);
        END LOOP;
    END;

    -- Total picks needed = player_count * letters_per_player
    DECLARE
        v_all_picked BOOLEAN := true;
        v_total_picks_needed INTEGER;
    BEGIN
        v_total_picks_needed := v_player_count * v_letters_per_player;

        IF v_selected_count < v_total_picks_needed THEN
            v_all_picked := false;
        END IF;

        -- Extract unique letters from all player picks
        SELECT array_agg(DISTINCT val ORDER BY val) INTO v_all_letters
        FROM (SELECT jsonb_array_elements_text(value) AS val
              FROM jsonb_each(v_player_letters)) sub;

        v_all_letters := COALESCE(v_all_letters, '{}');

        -- If we have at least variant unique letters, we can transition
        IF array_length(v_all_letters, 1) >= v_variant THEN
            v_all_picked := true;
        END IF;

        IF v_all_picked THEN
            -- Auto-fill: if we don't have variant unique letters, computer picks the rest
            IF array_length(v_all_letters, 1) < v_variant THEN
                v_needed := v_variant - array_length(v_all_letters, 1);
                v_computer_letters := v_all_letters;

                FOR v_i IN 1..v_needed LOOP
                    LOOP
                        v_rand_idx := floor(random() * 26)::int + 1;
                        IF NOT (v_alphabet[v_rand_idx] = ANY(v_computer_letters)) THEN
                            v_computer_letters := array_append(v_computer_letters, v_alphabet[v_rand_idx]);
                            EXIT;
                        END IF;
                    END LOOP;
                END LOOP;

                v_all_letters := v_computer_letters;
            END IF;

            -- Sort for display
            SELECT array_agg(letter ORDER BY letter) INTO v_all_letters
            FROM unnest(v_all_letters) AS letter;

            -- Determine next phase
            IF COALESCE((v_arena_state->>'poisonEnabled')::boolean, true) THEN
                v_new_phase := 'POISON_SETUP';
            ELSE
                v_new_phase := 'PLAYING';
            END IF;

            -- Initialize per-player timers if going to PLAYING
            v_player_timers := '{}'::jsonb;
            v_player_timer_counts := '{}'::jsonb;
            IF v_new_phase = 'PLAYING' THEN
                v_now := extract(epoch from now());
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
            END IF;

            UPDATE lobbies
            SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
                'phase', v_new_phase,
                'letters', to_jsonb(v_all_letters),
                'playerLetters', v_player_letters,
                'letterPickCounts', v_letter_pick_counts,
                'playerTimers', v_player_timers,
                'playerTimerCounts', v_player_timer_counts,
                'gameStartTime', CASE WHEN v_new_phase = 'PLAYING' THEN extract(epoch from now()) * 1000 ELSE NULL END
            )
            WHERE code = p_lobby_code
              AND arena_state->>'phase' = 'LETTER_SELECT';

            RETURN json_build_object(
                'success', true,
                'letter', p_letter,
                'letters', v_all_letters,
                'phase', v_new_phase,
                'my_picks', v_current_pick_count + 1,
                'picks_needed', v_letters_per_player,
                'auto_filled', (array_length(v_all_letters, 1) > v_selected_count)
            );
        END IF;
    END;

    -- Not all picks done yet — just update state
    UPDATE lobbies
    SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
        'playerLetters', v_player_letters,
        'letterPickCounts', v_letter_pick_counts
    )
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'LETTER_SELECT';

    -- Build current unique letters for display (must use jsonb_array_elements_text for nested arrays)
    SELECT array_agg(DISTINCT val ORDER BY val) INTO v_all_letters
    FROM (SELECT jsonb_array_elements_text(value) AS val
          FROM jsonb_each(v_player_letters)) sub;

    RETURN json_build_object(
        'success', true,
        'letter', p_letter,
        'letters', COALESCE(v_all_letters, '{}'),
        'phase', 'LETTER_SELECT',
        'my_picks', v_current_pick_count + 1,
        'picks_needed', v_letters_per_player
    );
END;
$$;

-- ── 3. Updated submit_links_word (pool multiplier, min 2 chars) ─────────────

CREATE OR REPLACE FUNCTION public.submit_links_word(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_word TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_word TEXT;
    v_word_len INTEGER;
    v_letters TEXT[];         -- pool letters
    v_player_letters JSONB;
    v_used_words JSONB;
    v_player_hearts JSONB;
    v_poison_letters JSONB;
    v_hearts INTEGER;
    v_points INTEGER := 0;
    v_base_points INTEGER := 0;
    v_pool_letters_used INTEGER := 0;
    v_pool_multiplier NUMERIC := 1.0;
    v_is_poisoned BOOLEAN := false;
    v_poison_letter TEXT := null;
    v_player_name TEXT;
    v_rows_inserted INTEGER;
    v_player_count INTEGER;
    v_eliminated_count INTEGER := 0;
    v_hearts_val INTEGER;
    v_letter TEXT;
    v_word_lower TEXT;
BEGIN
    -- Fetch lobby state
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Game is not in playing phase');
    END IF;

    -- Validate word format (min 2 chars now)
    v_word := lower(trim(p_word));
    IF v_word !~ '^[a-z]{2,15}$' THEN
        RETURN json_build_object('success', false, 'error', 'Word must be 2-15 letters, a-z only');
    END IF;

    v_word_len := length(v_word);
    v_letters := ARRAY(SELECT jsonb_array_elements_text(v_arena_state->'letters'));
    v_word_lower := v_word;

    -- ── Check word contains at least 2 letters from the pool ──
    v_pool_letters_used := 0;
    FOREACH v_letter IN ARRAY v_letters LOOP
        IF position(lower(v_letter) in v_word_lower) > 0 THEN
            v_pool_letters_used := v_pool_letters_used + 1;
        END IF;
    END LOOP;

    IF v_pool_letters_used < 2 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Word must contain at least 2 letters from the pool (' || array_to_string(v_letters, ', ') || ')',
            'error_code', 'INSUFFICIENT_POOL_LETTERS'
        );
    END IF;

    -- Check word not already used
    v_used_words := COALESCE(v_arena_state->'usedWords', '[]'::jsonb);
    IF v_used_words ? v_word THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Word already claimed',
            'error_code', 'ALREADY_USED'
        );
    END IF;

    -- Get player info
    SELECT name INTO v_player_name
    FROM players WHERE id = p_player_id;

    -- ── Calculate base points (existing length-based system) ──
    CASE
        WHEN v_word_len <= 4 THEN v_base_points := 10 * v_word_len;
        WHEN v_word_len <= 6 THEN v_base_points := 15 * v_word_len;
        WHEN v_word_len <= 8 THEN v_base_points := 20 * v_word_len;
        ELSE v_base_points := 30 * v_word_len;
    END CASE;

    -- ── Calculate pool letter multiplier ──
    CASE
        WHEN v_pool_letters_used <= 2 THEN v_pool_multiplier := 1.0;
        WHEN v_pool_letters_used = 3 THEN v_pool_multiplier := 1.5;
        WHEN v_pool_letters_used = 4 THEN v_pool_multiplier := 2.0;
        WHEN v_pool_letters_used = 5 THEN v_pool_multiplier := 2.5;
        WHEN v_pool_letters_used >= 6 THEN v_pool_multiplier := 3.0;
    END CASE;

    -- Final points = base × multiplier (rounded)
    v_points := ROUND(v_base_points * v_pool_multiplier);

    -- ── Check poison ──
    v_player_hearts := COALESCE(v_arena_state->'playerHearts', '{}'::jsonb);
    v_poison_letters := COALESCE(v_arena_state->'poisonLetters', '{}'::jsonb);
    v_hearts := COALESCE((v_player_hearts->>p_player_id::text)::integer, 3);

    DECLARE
        v_assigner_id TEXT;
        v_assigner_poisons JSONB;
        v_poison_for_me TEXT;
    BEGIN
        FOR v_assigner_id, v_assigner_poisons IN
            SELECT key, value FROM jsonb_each(v_poison_letters)
        LOOP
            v_poison_for_me := v_assigner_poisons->>p_player_id::text;
            IF v_poison_for_me IS NOT NULL AND position(lower(v_poison_for_me) in v_word) > 0 THEN
                v_is_poisoned := true;
                v_poison_letter := v_poison_for_me;
                v_hearts := v_hearts - 1;
                EXIT;
            END IF;
        END LOOP;
    END;

    -- Insert word record (with new columns)
    INSERT INTO links_words (
        lobby_code, player_id, player_name,
        word, word_length, points,
        is_poisoned, poison_letter, hearts_remaining,
        pool_letters_used, pool_multiplier
    ) VALUES (
        p_lobby_code, p_player_id, v_player_name,
        v_word, v_word_len, v_points,
        v_is_poisoned, v_poison_letter, v_hearts,
        v_pool_letters_used, v_pool_multiplier
    )
    ON CONFLICT ON CONSTRAINT unique_links_word DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;

    IF v_rows_inserted = 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Word already claimed (race condition)',
            'error_code', 'ALREADY_USED'
        );
    END IF;

    -- Update used words
    v_used_words := v_used_words || to_jsonb(v_word);

    -- Update scores
    UPDATE players
    SET score = COALESCE(score, 0) + v_points
    WHERE id = p_player_id;

    -- Update hearts
    v_player_hearts := v_player_hearts || jsonb_build_object(p_player_id::text, GREATEST(v_hearts, 0));

    -- ── Check game end conditions ──
    SELECT COUNT(*) INTO v_player_count
    FROM players WHERE lobby_code = p_lobby_code;

    v_eliminated_count := 0;
    FOR v_hearts_val IN
        SELECT (value::text)::integer FROM jsonb_each(v_player_hearts)
    LOOP
        IF v_hearts_val <= 0 THEN
            v_eliminated_count := v_eliminated_count + 1;
        END IF;
    END LOOP;

    DECLARE
        v_timer_end DOUBLE PRECISION;
        v_now DOUBLE PRECISION;
        v_new_phase TEXT;
    BEGIN
        v_timer_end := (v_arena_state->>'timerEndTime')::double precision;
        v_now := extract(epoch from now());
        v_new_phase := 'PLAYING';

        IF v_timer_end IS NOT NULL AND v_now >= v_timer_end THEN
            v_new_phase := 'RESULTS';
        END IF;

        IF v_player_count > 0 AND v_eliminated_count >= v_player_count THEN
            v_new_phase := 'RESULTS';
        END IF;

        IF v_player_count > 1 AND v_eliminated_count >= (v_player_count - 1) THEN
            v_new_phase := 'RESULTS';
        END IF;

        UPDATE lobbies
        SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', v_new_phase,
            'usedWords', v_used_words,
            'playerHearts', v_player_hearts,
            'scores', (
                SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
                FROM players WHERE lobby_code = p_lobby_code
            )
        )
        WHERE code = p_lobby_code
          AND arena_state->>'phase' = 'PLAYING';

        RETURN json_build_object(
            'success', true,
            'word', v_word,
            'points', v_points,
            'base_points', v_base_points,
            'pool_letters_used', v_pool_letters_used,
            'pool_multiplier', v_pool_multiplier,
            'is_poisoned', v_is_poisoned,
            'poison_letter', v_poison_letter,
            'hearts_remaining', v_hearts,
            'phase', v_new_phase,
            'eliminated', (v_hearts <= 0)
        );
    END;
END;
$$;

-- ── 4. Updated assign_links_poison (check poisonPairings instead of autoLetters) ──

CREATE OR REPLACE FUNCTION public.assign_links_poison(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_poison_map JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
    v_poison_letters JSONB;
    v_player_count INTEGER;
    v_assigned_count INTEGER;
    v_poison_pairings JSONB;
    v_my_pairing JSONB;
    v_target_id TEXT;
    v_poison_letter TEXT;
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

    v_poison_pairings := COALESCE(v_arena_state->'poisonPairings', '{}'::jsonb);

    -- Check if pairings exist (new multi-pick flow OR old auto mode)
    IF v_poison_pairings ? p_player_id::text THEN
        -- ── Pairing-based poison logic (works for ALL player counts) ──
        v_my_pairing := v_poison_pairings->p_player_id::text;

        IF v_my_pairing IS NULL THEN
            RETURN json_build_object('success', false, 'error', 'No poison assignment found for you');
        END IF;

        -- Count entries in the poison map
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

        -- Store the poison letter
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
                'all_assigned', true
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
                'player_count', v_player_count
            );
        END IF;
    END IF;

    -- ── Fallback: no pairings (shouldn't happen with new flow) ──
    RETURN json_build_object('success', false, 'error', 'No poison pairings found');
END;
$$;

-- ── 5. Grant permissions ────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.start_links_game(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_links_letter(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_links_word(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_links_poison(TEXT, UUID, JSONB) TO anon, authenticated;
