-- ============================================================================
-- Realtime Fix: Add all game tables to supabase_realtime publication
-- ============================================================================
-- Root cause: players + simultaneous_answers tables were NOT in supabase_realtime,
-- so postgres_changes subscriptions silently failed. The realtime channel kept
-- closing/reconnecting because postgres_changes subscriptions to non-publication
-- tables cause the Supabase realtime server to reject the channel.
--
-- Additionally, the host never saw new players join without refreshing.
-- ============================================================================

-- ── 1. Add players to supabase_realtime publication ─────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'players'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
    END IF;
END;
$$;

-- ── 2. Add simultaneous_answers to supabase_realtime publication (safety net) ──

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'simultaneous_answers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.simultaneous_answers;
    END IF;
END;
$$;

-- ── 3. Add lobbies to supabase_realtime publication (safety net) ────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'lobbies'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.lobbies;
    END IF;
END;
$$;

-- ── 4. REPLICA IDENTITY FULL so postgres_changes sends full row data ────────

ALTER TABLE public.players REPLICA IDENTITY FULL;
ALTER TABLE public.simultaneous_answers REPLICA IDENTITY FULL;
ALTER TABLE public.lobbies REPLICA IDENTITY FULL;
