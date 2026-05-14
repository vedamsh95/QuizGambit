-- Fix for missing column lobby_code in arena_answers
ALTER TABLE arena_answers 
ADD COLUMN IF NOT EXISTS lobby_code TEXT REFERENCES lobbies(code) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_arena_answers_lobby_code ON arena_answers(lobby_code);
