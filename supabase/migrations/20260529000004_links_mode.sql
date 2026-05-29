-- ============================================================================
-- LINKS Game Mode — Vocabulary Duel
-- ============================================================================
-- 2-4 players each pick a letter. Words must contain ALL chosen letters.
-- Shared word pool — first to claim a word locks it for everyone.
-- Optional Poison Variant: each player secretly assigns a poison letter to
-- each opponent. Using it costs 1 of 3 hearts.
-- ============================================================================

-- ── 1. LINKS Words Table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.links_words (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lobby_code TEXT NOT NULL,
    player_id UUID NOT NULL,
    player_name TEXT,
    word TEXT NOT NULL,
    word_length INTEGER NOT NULL,
    points INTEGER DEFAULT 0,
    is_poisoned BOOLEAN DEFAULT false,
    poison_letter TEXT,
    hearts_remaining INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- One claim per word per lobby (timestamp tie-breaker in app logic)
    CONSTRAINT unique_links_word UNIQUE (lobby_code, word)
);

CREATE INDEX IF NOT EXISTS idx_links_words_lobby ON links_words(lobby_code);
CREATE INDEX IF NOT EXISTS idx_links_words_player ON links_words(player_id);
CREATE INDEX IF NOT EXISTS idx_links_words_lobby_player ON links_words(lobby_code, player_id);

-- Enable RLS
ALTER TABLE public.links_words ENABLE ROW LEVEL SECURITY;

-- RLS policies: broad access (all writes go through SECURITY DEFINER RPC functions,
-- but realtime postgres_changes needs SELECT permission)
DROP POLICY IF EXISTS "Anyone can read links_words" ON public.links_words;
CREATE POLICY "Anyone can read links_words" ON public.links_words FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert links_words" ON public.links_words;
CREATE POLICY "Anyone can insert links_words" ON public.links_words FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update links_words" ON public.links_words;
CREATE POLICY "Anyone can update links_words" ON public.links_words FOR UPDATE USING (true);

-- ── 2. Start LINKS Game ─────────────────────────────────────────────────────

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
BEGIN
    -- Get all players in random order
    SELECT array_agg(id ORDER BY joined_at) INTO v_players
    FROM players
    WHERE lobby_code = p_lobby_code;

    v_player_count := array_length(v_players, 1);

    IF v_players IS NULL OR v_player_count < 2 THEN
        RETURN json_build_object('success', false, 'error', 'Need at least 2 players');
    END IF;

    IF v_player_count > 4 THEN
        RETURN json_build_object('success', false, 'error', 'Maximum 4 players');
    END IF;

    -- Check for existing state (reconnect resilience)
    SELECT arena_state INTO v_existing_state
    FROM lobbies WHERE code = p_lobby_code;

    -- Only resume valid LINKS phases (ignore stale state from other modes like
    -- Simultaneous 'PICKING' which would cause "Unknown phase" on the client)
    IF v_existing_state IS NOT NULL AND v_existing_state->>'phase' IS NOT NULL
       AND v_existing_state->>'phase' IN ('LETTER_SELECT', 'POISON_SETUP', 'PLAYING') THEN
        RETURN json_build_object(
            'success', true,
            'status', 'PLAYING',
            'phase', v_existing_state->>'phase',
            'resumed', true
        );
    END IF;

    -- Initialize game state
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
            'timerEndTime', null,
            'poisonEnabled', COALESCE((p_settings->>'poisonEnabled')::boolean, true),
            'roundDuration', COALESCE((p_settings->>'roundDuration')::integer, 60)
        )
    WHERE code = p_lobby_code;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Lobby not found');
    END IF;

    RETURN json_build_object(
        'success', true,
        'status', 'PLAYING',
        'phase', 'LETTER_SELECT',
        'player_count', v_player_count
    );
END;
$$;

-- ── 3. Select Letter (player picks their letter) ────────────────────────────

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
    v_player_letters JSONB;
    v_all_letters TEXT[];
    v_player_count INTEGER;
    v_selected_count INTEGER;
    v_new_phase TEXT;
    v_next_picker UUID;
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

    -- Check letter not already taken
    v_player_letters := COALESCE(v_arena_state->'playerLetters', '{}'::jsonb);
    IF v_player_letters ? p_letter THEN
        RETURN json_build_object('success', false, 'error', 'Letter already chosen by another player');
    END IF;

    -- Check player hasn't already selected
    IF v_player_letters ? p_player_id::text THEN
        RETURN json_build_object('success', false, 'error', 'You already selected a letter');
    END IF;

    -- Record selection
    v_player_letters := v_player_letters || jsonb_build_object(p_player_id::text, p_letter);

    -- Build sorted letters array
    SELECT array_agg(DISTINCT val ORDER BY val)
    INTO v_all_letters
    FROM jsonb_each_text(v_player_letters) AS kv(key, val);

    -- Count selections
    SELECT COUNT(*) INTO v_player_count
    FROM players WHERE lobby_code = p_lobby_code;

    SELECT COUNT(*) INTO v_selected_count
    FROM jsonb_each_text(v_player_letters) AS kv;

    -- Determine next phase
    v_new_phase := 'LETTER_SELECT';
    IF v_selected_count >= v_player_count THEN
        IF COALESCE((v_arena_state->>'poisonEnabled')::boolean, true) THEN
            v_new_phase := 'POISON_SETUP';
        ELSE
            v_new_phase := 'PLAYING';
        END IF;
    END IF;

    UPDATE lobbies
    SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
        'phase', v_new_phase,
        'letters', to_jsonb(v_all_letters),
        'playerLetters', v_player_letters,
        'timerEndTime', CASE WHEN v_new_phase = 'PLAYING' THEN
            extract(epoch from now()) + COALESCE((v_arena_state->>'roundDuration')::integer, 60)
        ELSE NULL END,
        'gameStartTime', CASE WHEN v_new_phase = 'PLAYING' THEN
            extract(epoch from now()) * 1000
        ELSE NULL END
    )
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'LETTER_SELECT';

    RETURN json_build_object(
        'success', true,
        'letter', p_letter,
        'letters', v_all_letters,
        'phase', v_new_phase,
        'selected_count', v_selected_count,
        'player_count', v_player_count
    );
END;
$$;

-- ── 4. Assign Poison Letters ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.assign_links_poison(
    p_lobby_code TEXT,
    p_player_id UUID,
    p_poison_map JSONB  -- { "targetPlayerId": "X", ... }
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
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'POISON_SETUP' THEN
        RETURN json_build_object('success', false, 'error', 'Not in poison setup phase');
    END IF;

    v_player_letters := COALESCE(v_arena_state->'playerLetters', '{}'::jsonb);

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

    -- Check if all players have assigned poisons → transition to PLAYING
    IF v_assigned_count >= v_player_count THEN
        -- Initialize hearts for all players
        UPDATE lobbies
        SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
            'phase', 'PLAYING',
            'poisonLetters', v_poison_letters,
            'playerHearts', (
                SELECT jsonb_object_agg(id::text, 3)
                FROM players WHERE lobby_code = p_lobby_code
            ),
            'timerEndTime', extract(epoch from now()) + COALESCE((v_arena_state->>'roundDuration')::integer, 60),
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

-- ── 5. Submit LINKS Word ────────────────────────────────────────────────────

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
    v_letters TEXT[];
    v_player_letter TEXT;
    v_player_letters JSONB;
    v_used_words JSONB;
    v_player_hearts JSONB;
    v_poison_letters JSONB;
    v_my_poisons JSONB;
    v_hearts INTEGER;
    v_points INTEGER := 0;
    v_is_poisoned BOOLEAN := false;
    v_poison_letter TEXT := null;
    v_player_name TEXT;
    v_rows_inserted INTEGER;
    v_player_count INTEGER;
    v_word_count INTEGER;
    v_all_hearts JSONB;
    v_eliminated_count INTEGER := 0;
    v_hearts_val INTEGER;
BEGIN
    -- Fetch lobby state
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Game is not in playing phase');
    END IF;

    -- Validate word format
    v_word := lower(trim(p_word));
    IF v_word !~ '^[a-z]{3,15}$' THEN
        RETURN json_build_object('success', false, 'error', 'Word must be 3-15 letters, a-z only');
    END IF;

    v_word_len := length(v_word);
    v_letters := ARRAY(SELECT jsonb_array_elements_text(v_arena_state->'letters'));

    -- Check word contains ALL required letters
    DECLARE
        v_letter TEXT;
    BEGIN
        FOREACH v_letter IN ARRAY v_letters LOOP
            IF position(lower(v_letter) in v_word) = 0 THEN
                RETURN json_build_object(
                    'success', false,
                    'error', 'Missing required letter: ' || v_letter,
                    'error_code', 'MISSING_LETTER'
                );
            END IF;
        END LOOP;
    END;

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

    v_player_letters := COALESCE(v_arena_state->'playerLetters', '{}'::jsonb);
    v_player_letter := v_player_letters->>p_player_id::text;

    -- Calculate points based on word length
    CASE
        WHEN v_word_len <= 4 THEN v_points := 10 * v_word_len;
        WHEN v_word_len <= 6 THEN v_points := 15 * v_word_len;
        WHEN v_word_len <= 8 THEN v_points := 20 * v_word_len;
        ELSE v_points := 30 * v_word_len;
    END CASE;

    -- Check poison
    v_player_hearts := COALESCE(v_arena_state->'playerHearts', '{}'::jsonb);
    v_poison_letters := COALESCE(v_arena_state->'poisonLetters', '{}'::jsonb);
    v_hearts := COALESCE((v_player_hearts->>p_player_id::text)::integer, 3);

    -- Find poison letters assigned TO this player
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

    -- Insert word record
    INSERT INTO links_words (
        lobby_code, player_id, player_name,
        word, word_length, points,
        is_poisoned, poison_letter, hearts_remaining
    ) VALUES (
        p_lobby_code, p_player_id, v_player_name,
        v_word, v_word_len, v_points,
        v_is_poisoned, v_poison_letter, v_hearts
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

    -- Check if all players eliminated OR timer expired
    SELECT COUNT(*) INTO v_player_count
    FROM players WHERE lobby_code = p_lobby_code;

    -- Count eliminated players
    v_eliminated_count := 0;
    FOR v_hearts_val IN
        SELECT (value::text)::integer FROM jsonb_each(v_player_hearts)
    LOOP
        IF v_hearts_val <= 0 THEN
            v_eliminated_count := v_eliminated_count + 1;
        END IF;
    END LOOP;

    -- Check if time expired
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

        -- All players eliminated → end game
        IF v_player_count > 0 AND v_eliminated_count >= v_player_count THEN
            v_new_phase := 'RESULTS';
        END IF;

        -- One player left → end game
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
            'is_poisoned', v_is_poisoned,
            'poison_letter', v_poison_letter,
            'hearts_remaining', v_hearts,
            'phase', v_new_phase,
            'eliminated', (v_hearts <= 0)
        );
    END;
END;
$$;

-- ── 6. End LINKS Round (force transition to RESULTS) ────────────────────────

CREATE OR REPLACE FUNCTION public.end_links_round(
    p_lobby_code TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_arena_state JSONB;
BEGIN
    SELECT arena_state INTO v_arena_state
    FROM lobbies WHERE code = p_lobby_code;

    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Game is not in playing phase');
    END IF;

    UPDATE lobbies
    SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
        'phase', 'RESULTS',
        'scores', (
            SELECT jsonb_object_agg(id::text, COALESCE(score, 0))
            FROM players WHERE lobby_code = p_lobby_code
        )
    )
    WHERE code = p_lobby_code
      AND arena_state->>'phase' = 'PLAYING';

    RETURN json_build_object('success', true, 'phase', 'RESULTS');
END;
$$;

-- ── 7. Server-Side Word Validation (anti-cheat, optional) ───────────────────

-- This is a basic server-side word validation. For full dictionary validation,
-- the client uses pre-loaded word sets. This function provides a lightweight
-- server-side check that the word is valid format and contains required letters.

CREATE OR REPLACE FUNCTION public.validate_links_word(
    p_word TEXT,
    p_letters TEXT[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_word TEXT;
    v_letter TEXT;
BEGIN
    v_word := lower(trim(p_word));

    IF v_word !~ '^[a-z]{3,15}$' THEN
        RETURN json_build_object('valid', false, 'error', 'Word must be 3-15 letters');
    END IF;

    FOREACH v_letter IN ARRAY p_letters LOOP
        IF position(lower(v_letter) in v_word) = 0 THEN
            RETURN json_build_object('valid', false, 'error', 'Missing required letter: ' || v_letter);
        END IF;
    END LOOP;

    RETURN json_build_object('valid', true);
END;
$$;

-- ── 8. Grant execute permissions ────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.start_links_game(TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.select_links_letter(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_links_poison(TEXT, UUID, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_links_word(TEXT, UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_links_round(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_links_word(TEXT, TEXT[]) TO anon, authenticated;

-- ── 9. Add links_words to supabase_realtime for live updates ────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'links_words'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.links_words;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.links_words REPLICA IDENTITY FULL;
