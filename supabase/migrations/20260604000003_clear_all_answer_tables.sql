-- ============================================================================
-- Fix: Clear ALL answer tables on Play Again + new game start
-- ============================================================================
-- BUG: reset_lobby_for_new_game only cleared simultaneous_answers but:
--   - ArenaBoard uses arena_answers table
--   - LinksBoardV3 uses links_words table
--   - LinksSprintBoardV3 uses links_sprint_words table
-- All leaked old answers across games (ON CONFLICT DO NOTHING blocked new ones).
-- Table existence guards prevent migration failure if a mode's tables don't exist.
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_lobby_for_new_game(
  p_lobby_code text
) RETURNS void AS $$
BEGIN
  -- Nuke ALL answer tables from previous game (with table existence guards)
  DELETE FROM simultaneous_answers WHERE lobby_code = p_lobby_code;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'arena_answers') THEN
    DELETE FROM arena_answers WHERE lobby_code = p_lobby_code;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'links_words') THEN
    DELETE FROM links_words WHERE lobby_code = p_lobby_code;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'links_sprint_words') THEN
    DELETE FROM links_sprint_words WHERE lobby_code = p_lobby_code;
  END IF;

  UPDATE lobbies
  SET
    status = 'LOBBY',
    buzzed_player_id = NULL,
    current_question_id = NULL,
    -- Clear ALL game-specific settings
    settings = COALESCE(settings, '{}'::jsonb) - 'round_categories'
                                            - 'draft'
                                            - 'draftPicks'
                                            - 'revealed_questions'
                                            - 'revealed_questions_by_round'
                                            - 'simultaneous_categories',
    arena_state = NULL
  WHERE code = p_lobby_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
