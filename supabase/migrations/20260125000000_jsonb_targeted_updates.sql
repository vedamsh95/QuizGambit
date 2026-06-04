-- Migration: Targeted JSONB updates to eliminate read-modify-write race conditions
-- Replaces full-settings-blob writes with atomic jsonb_set operations

-- 1. Update a single top-level settings key (e.g. rounds, timer, hasBuzzer)
CREATE OR REPLACE FUNCTION update_lobby_setting_key(
  p_lobby_code text,
  p_key text,
  p_value jsonb
) RETURNS void AS $$
BEGIN
  UPDATE lobbies
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), ARRAY[p_key], p_value)
  WHERE code = p_lobby_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update a nested settings path (e.g. ['draft','picks'] or ['round_categories'])
CREATE OR REPLACE FUNCTION update_lobby_setting_path(
  p_lobby_code text,
  p_path text[],
  p_value jsonb
) RETURNS void AS $$
BEGIN
  UPDATE lobbies
  SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), p_path, p_value)
  WHERE code = p_lobby_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Append a question ID to revealed_questions array (atomic, no race)
CREATE OR REPLACE FUNCTION append_revealed_question(
  p_lobby_code text,
  p_question_id text
) RETURNS void AS $$
BEGIN
  UPDATE lobbies
  SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    ARRAY['revealed_questions'],
    COALESCE(settings->'revealed_questions', '[]'::jsonb) || to_jsonb(p_question_id)
  )
  WHERE code = p_lobby_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Merge partial settings (safe merge: only updates specified keys, preserves others)
CREATE OR REPLACE FUNCTION merge_lobby_settings(
  p_lobby_code text,
  p_merge jsonb
) RETURNS void AS $$
BEGIN
  UPDATE lobbies
  SET settings = COALESCE(settings, '{}'::jsonb) || p_merge
  WHERE code = p_lobby_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Delete a settings key (e.g. clear draft, round_categories)
CREATE OR REPLACE FUNCTION delete_lobby_setting_key(
  p_lobby_code text,
  p_key text
) RETURNS void AS $$
BEGIN
  UPDATE lobbies
  SET settings = COALESCE(settings, '{}'::jsonb) - p_key
  WHERE code = p_lobby_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Reset game state (clear question pointers + clean settings for new game)
-- Atomic: single UPDATE that clears all game-specific fields
CREATE OR REPLACE FUNCTION reset_lobby_for_new_game(
  p_lobby_code text
) RETURNS void AS $$
BEGIN
  UPDATE lobbies
  SET
    status = 'LOBBY',
    buzzed_player_id = NULL,
    current_question_id = NULL,
    -- Clear round-aware revealed state (new format used by GameBoardV2 + SimultaneousBoard)
    settings = COALESCE(settings, '{}'::jsonb) - 'round_categories'
                                            - 'draft'
                                            - 'revealed_questions'
                                            - 'revealed_questions_by_round'
                                            - 'simultaneous_categories',
    -- Nuke stale arena_state so start_simultaneous_session doesn't "resume" old games
    arena_state = NULL
  WHERE code = p_lobby_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
