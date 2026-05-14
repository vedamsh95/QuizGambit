-- Align arena_answers table with the submit_arena_answer RPC
-- RPC expects: lobby_code, question_id, player_id, player_name, answer_text, is_correct, answer_time_ms, rank, points_awarded

ALTER TABLE arena_answers ADD COLUMN IF NOT EXISTS question_id TEXT;
ALTER TABLE arena_answers ADD COLUMN IF NOT EXISTS player_name TEXT;
ALTER TABLE arena_answers ADD COLUMN IF NOT EXISTS answer_text TEXT;
ALTER TABLE arena_answers ADD COLUMN IF NOT EXISTS answer_time_ms INTEGER;
ALTER TABLE arena_answers ADD COLUMN IF NOT EXISTS rank INTEGER; -- Maps to 'slot_rank' conceptually but RPC uses 'rank'
ALTER TABLE arena_answers ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;

-- Make turn_id nullable since we are using lobby_code + question_id for grouping now
ALTER TABLE arena_answers ALTER COLUMN turn_id DROP NOT NULL;
