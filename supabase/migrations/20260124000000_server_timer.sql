-- ============================================================================
-- Server-Side Timer Enforcement for Arena Mode
-- ============================================================================
-- Problem: The host's browser controls the timer. If the host disconnects,
-- the game hangs forever because no client calls force_close_question().
--
-- Solution: This function can be called by a cron job (pg_cron or Edge Function)
-- every 5 seconds to auto-close questions that have exceeded their time limit.
-- It ensures the game never hangs even if all clients disconnect.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_close_stale_arena_questions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    stale_lobby RECORD;
    now_epoch float;
    timeout_secs int;
BEGIN
    now_epoch := extract(epoch from now());

    -- Find all Arena lobbies where a question is OPEN and the timer has expired
    -- We add a 5-second grace period beyond the configured answerTime
    FOR stale_lobby IN
        SELECT
            code,
            (arena_state->>'timerEndTime')::float AS timer_end_time,
            COALESCE((settings->>'answerTime')::int, (settings->>'timer')::int, 15) AS answer_time
        FROM public.lobbies
        WHERE
            mode = 'ARENA'
            AND status IN ('PLAYING')
            AND arena_state IS NOT NULL
            AND arena_state->>'phase' = 'OPEN'
            AND (arena_state->>'timerEndTime')::float IS NOT NULL
            AND (arena_state->>'timerEndTime')::float < (now_epoch - 5)  -- 5s grace
    LOOP
        -- Force close the question — same logic as force_close_question RPC
        UPDATE public.lobbies
        SET
            arena_state = jsonb_set(
                jsonb_set(
                    COALESCE(arena_state, '{}'::jsonb),
                    '{phase}',
                    '"RESULTS"'
                ),
                '{autoClosed}',
                'true'
            )
        WHERE code = stale_lobby.code
          AND arena_state->>'phase' = 'OPEN'; -- Double-check to avoid races

        RAISE NOTICE '[ServerTimer] Auto-closed stale question for lobby % (expired for %s)',
            stale_lobby.code,
            to_char((now_epoch - stale_lobby.timer_end_time)::int, '999') || 's';
    END LOOP;
END;
$$;


-- ============================================================================
-- Migration: Add autoClose tracking field to existing lobbies
-- This is a no-op schema note — the field is written inline via jsonb_set
-- No DDL changes needed since arena_state is already a jsonb column
-- ============================================================================


-- ============================================================================
-- Optional: pg_cron scheduled job (requires pg_cron extension)
-- Uncomment if you have pg_cron installed on your Supabase project:
-- ============================================================================

-- SELECT cron.schedule(
--     'auto-close-arena-questions',
--     '5 seconds',
--     'SELECT public.auto_close_stale_arena_questions();'
-- );


-- ============================================================================
-- Alternative: Edge Function version (if pg_cron is not available)
-- Create a Supabase Edge Function that calls:
--   SELECT public.auto_close_stale_arena_questions();
-- Then trigger it via an external cron service or a client-side heartbeat
-- ============================================================================
