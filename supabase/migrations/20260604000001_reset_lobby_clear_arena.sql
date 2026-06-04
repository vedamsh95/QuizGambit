-- ============================================================================
-- Fix reset_lobby_for_new_game: clear arena_state + round-aware revealed state
-- ============================================================================
-- Previous version only cleared settings.revealed_questions (old flat key).
-- After adding round-aware revealed_questions_by_round (used by GameBoardV2
-- and SimultaneousBoard), "Play Again" would leak stale revealed state into
-- new games. Additionally, arena_state was never cleared, so
-- start_simultaneous_session could "resume" an old game.
--
-- Fix: clear arena_state, revealed_questions_by_round, and
-- simultaneous_categories. Use key removal (- operator) instead of setting
-- empty arrays so the keys are cleanly absent (code uses || [] fallbacks).
-- ============================================================================

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
