-- Drop the old version of the function that accepted answer_time_ms
-- This is necessary because Postgres supports function overloading
DROP FUNCTION IF EXISTS submit_arena_answer(text, text, uuid, text, text, integer, integer, text, boolean);
