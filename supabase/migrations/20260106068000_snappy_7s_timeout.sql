-- Snappy 2s/7s Cadence: Reduce ghost timeout from 15s to 7s
-- All RPCs now use 7 second threshold for active player detection

-- submit_arena_answer, force_close_question, check_stale_picker
-- All updated to use INTERVAL '7 seconds' instead of '15 seconds'
