-- ============================================================================
-- LINKS Sprint: Pool Letter Multiplier + Min 2-char words
-- ============================================================================
-- Adds pool letter multiplier to submit_links_sprint_word (same formula as Classic):
--   2 pool letters used → 1.0×  (no bonus)
--   3 pool letters used → 1.5×
--   4 pool letters used → 2.0×
--   5 pool letters used → 2.5×
--   6 pool letters used → 3.0×
-- Also changes minimum word length from 3 to 2 characters.
-- ============================================================================

-- Add pool columns to links_sprint_words if not present
ALTER TABLE public.links_sprint_words
    ADD COLUMN IF NOT EXISTS pool_letters_used INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pool_multiplier NUMERIC DEFAULT 1.0;

-- Updated submit_links_sprint_word with pool multiplier
CREATE OR REPLACE FUNCTION public.submit_links_sprint_word(
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
    v_word TEXT; v_word_len INTEGER; v_letters TEXT[];
    v_used_words JSONB; v_player_name TEXT;
    v_base_points INTEGER := 0;
    v_pool_letters_used INTEGER := 0;
    v_pool_multiplier NUMERIC := 1.0;
    v_points INTEGER := 0;
    v_is_target BOOLEAN := false;
    v_target_level INTEGER := null; v_targets JSONB;
    v_target_entry JSONB; v_rows_inserted INTEGER;
    v_current_wave INTEGER; v_letter TEXT;
    v_player_letters JSONB;
    v_word_lower TEXT;
BEGIN
    SELECT arena_state INTO v_arena_state FROM lobbies WHERE code = p_lobby_code;
    IF v_arena_state->>'phase' != 'PLAYING' THEN
        RETURN json_build_object('success', false, 'error', 'Game is not in playing phase');
    END IF;
    v_word := lower(trim(p_word));
    -- Min 2 chars now (was 3)
    IF v_word !~ '^[a-z]{2,15}$' THEN
        RETURN json_build_object('success', false, 'error', 'Word must be 2-15 letters, a-z only');
    END IF;
    v_word_len := length(v_word);
    v_word_lower := v_word;

    -- Use player-specific letters if available, otherwise fall back to shared letters
    v_player_letters := v_arena_state->'playerLetters'->(p_player_id::text);
    IF v_player_letters IS NOT NULL AND jsonb_array_length(v_player_letters) > 0 THEN
        v_letters := ARRAY(SELECT jsonb_array_elements_text(v_player_letters));
    ELSE
        v_letters := ARRAY(SELECT jsonb_array_elements_text(v_arena_state->'letters'));
    END IF;

    v_current_wave := COALESCE((v_arena_state->>'currentWave')::integer, 1);

    -- Check word contains at least 2 letters from the pool
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

    v_used_words := COALESCE(v_arena_state->'usedWords', '[]'::jsonb);
    IF v_used_words ? v_word THEN
        RETURN json_build_object('success', false, 'error', 'Word already claimed', 'error_code', 'ALREADY_USED');
    END IF;

    SELECT name INTO v_player_name FROM players WHERE id = p_player_id;

    -- Calculate base points (existing length-based system)
    CASE WHEN v_word_len <= 4 THEN v_base_points := 10 * v_word_len;
         WHEN v_word_len <= 6 THEN v_base_points := 15 * v_word_len;
         WHEN v_word_len <= 8 THEN v_base_points := 20 * v_word_len;
         ELSE v_base_points := 30 * v_word_len;
    END CASE;

    -- Calculate pool letter multiplier (same formula as Classic)
    CASE
        WHEN v_pool_letters_used <= 2 THEN v_pool_multiplier := 1.0;
        WHEN v_pool_letters_used = 3 THEN v_pool_multiplier := 1.5;
        WHEN v_pool_letters_used = 4 THEN v_pool_multiplier := 2.0;
        WHEN v_pool_letters_used = 5 THEN v_pool_multiplier := 2.5;
        WHEN v_pool_letters_used >= 6 THEN v_pool_multiplier := 3.0;
    END CASE;

    -- Final points = base × multiplier (rounded)
    v_points := ROUND(v_base_points * v_pool_multiplier);

    -- Check for target word bonus (added on top of multiplied base)
    v_targets := COALESCE(v_arena_state->'targetWords', '[]'::jsonb);
    FOR v_target_entry IN SELECT jsonb_array_elements(v_targets) LOOP
        IF lower(v_target_entry->>'word') = v_word THEN
            v_is_target := true;
            v_target_level := (v_target_entry->>'level')::integer;
            v_points := v_points + (v_target_entry->>'bonus')::integer;
            EXIT;
        END IF;
    END LOOP;

    INSERT INTO links_sprint_words (
        lobby_code, player_id, player_name,
        word, word_length, points,
        is_target, target_level, wave,
        pool_letters_used, pool_multiplier
    )
    VALUES (
        p_lobby_code, p_player_id, v_player_name,
        v_word, v_word_len, v_points,
        v_is_target, v_target_level, v_current_wave,
        v_pool_letters_used, v_pool_multiplier
    )
    ON CONFLICT ON CONSTRAINT unique_sprint_word DO NOTHING;

    GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
    IF v_rows_inserted = 0 THEN
        RETURN json_build_object('success', false, 'error', 'Word already claimed (race condition)', 'error_code', 'ALREADY_USED');
    END IF;

    v_used_words := v_used_words || to_jsonb(v_word);
    UPDATE players SET score = COALESCE(score, 0) + v_points WHERE id = p_player_id;
    UPDATE lobbies SET arena_state = COALESCE(arena_state, '{}'::jsonb) || jsonb_build_object(
        'usedWords', v_used_words,
        'scores', (SELECT jsonb_object_agg(id::text, COALESCE(score, 0)) FROM players WHERE lobby_code = p_lobby_code)
    ) WHERE code = p_lobby_code AND arena_state->>'phase' = 'PLAYING';

    RETURN json_build_object(
        'success', true,
        'word', v_word,
        'points', v_points,
        'base_points', v_base_points,
        'pool_letters_used', v_pool_letters_used,
        'pool_multiplier', v_pool_multiplier,
        'is_target', v_is_target,
        'target_level', v_target_level,
        'wave', v_current_wave
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_links_sprint_word(TEXT, UUID, TEXT) TO anon, authenticated;
