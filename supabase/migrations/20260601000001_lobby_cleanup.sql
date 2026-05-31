-- ============================================================================
-- Lobby Cleanup — Auto-delete stale/idle lobbies
-- ============================================================================
-- Industry standards for web multiplayer lobby timeouts:
--   • 0 players in lobby   → delete immediately (within 30s)
--   • 1 player idle        → delete after 5 minutes
--   • Lobby idle (no activity) → delete after 30 minutes
--
-- The cleanup_stale_lobbies() function should be called periodically:
--   • Via Supabase Edge Function cron (recommended: every 60 seconds)
--   • Or via pg_cron if installed: SELECT cron.schedule('cleanup-lobbies', '* * * * *', 'SELECT cleanup_stale_lobbies();');
--   • Or triggered client-side from the home screen on load
-- ============================================================================

-- ── 1. Add last_activity_at column ──────────────────────────────────────────

ALTER TABLE public.lobbies
ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill existing rows
UPDATE public.lobbies
SET last_activity_at = created_at
WHERE last_activity_at IS NULL;

-- ── 2. Touch function (called by triggers + app code) ───────────────────────

CREATE OR REPLACE FUNCTION public.touch_lobby(p_lobby_code TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    UPDATE lobbies
    SET last_activity_at = NOW()
    WHERE code = p_lobby_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_lobby(TEXT) TO anon, authenticated;

-- ── 3. Auto-touch on player insert/delete ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_lobby_on_player_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
    -- NEW.lobby_code for INSERT/UPDATE, OLD.lobby_code for DELETE
    PERFORM public.touch_lobby(COALESCE(NEW.lobby_code, OLD.lobby_code));
    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS player_lobby_touch_trigger ON public.players;
CREATE TRIGGER player_lobby_touch_trigger
AFTER INSERT OR DELETE ON public.players
FOR EACH ROW
EXECUTE FUNCTION public.touch_lobby_on_player_change();

-- ── 4. Cleanup function ─────────────────────────────────────────────────────

-- Drop first to allow return type change (PostgreSQL doesn't let CREATE OR REPLACE change return type)
DROP FUNCTION IF EXISTS public.cleanup_stale_lobbies();

CREATE OR REPLACE FUNCTION public.cleanup_stale_lobbies()
RETURNS TABLE(deleted_code TEXT, reason TEXT, player_count INTEGER, idle_minutes NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_lobby RECORD;
    v_player_count INTEGER;
    v_idle_minutes NUMERIC;
BEGIN
    FOR v_lobby IN
        SELECT code, host_id, status, last_activity_at, created_at
        FROM public.lobbies
        WHERE status = 'LOBBY'  -- Only clean LOBBY-status lobbies (not active games)
    LOOP
        -- Count active players in this lobby
        SELECT COUNT(*) INTO v_player_count
        FROM public.players
        WHERE lobby_code = v_lobby.code;

        v_idle_minutes := EXTRACT(EPOCH FROM (NOW() - COALESCE(v_lobby.last_activity_at, v_lobby.created_at))) / 60.0;

        -- Case 1: No players left — immediate cleanup
        IF v_player_count = 0 THEN
            DELETE FROM public.lobbies WHERE code = v_lobby.code;
            deleted_code := v_lobby.code;
            reason := 'No players left';
            player_count := 0;
            idle_minutes := ROUND(v_idle_minutes::numeric, 1);
            RETURN NEXT;
            CONTINUE;
        END IF;

        -- Case 2: Only 1 player, idle > 5 minutes
        IF v_player_count = 1 AND v_idle_minutes > 5 THEN
            DELETE FROM public.lobbies WHERE code = v_lobby.code;
            deleted_code := v_lobby.code;
            reason := 'Single player idle >5min';
            player_count := 1;
            idle_minutes := ROUND(v_idle_minutes::numeric, 1);
            RETURN NEXT;
            CONTINUE;
        END IF;

        -- Case 3: No activity > 30 minutes (abandoned lobby)
        IF v_idle_minutes > 30 THEN
            DELETE FROM public.lobbies WHERE code = v_lobby.code;
            deleted_code := v_lobby.code;
            reason := 'Abandoned >30min';
            player_count := v_player_count;
            idle_minutes := ROUND(v_idle_minutes::numeric, 1);
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_stale_lobbies() TO anon, authenticated;

-- ── 5. Optional: pg_cron scheduled job (requires pg_cron extension) ─────────
-- Uncomment if pg_cron is installed on your Supabase project:
--
-- SELECT cron.schedule(
--     'lobby-cleanup',
--     '* * * * *',   -- every minute
--     $$SELECT cleanup_stale_lobbies();$$
-- );
--
-- Alternative: Use a Supabase Edge Function with a cron trigger:
--   supabase functions deploy cleanup-lobbies --schedule '* * * * *'
-- The Edge Function body would be:
--   import { createClient } from '@supabase/supabase-js';
--   Deno.serve(async () => {
--     const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
--     const { data, error } = await supabase.rpc('cleanup_stale_lobbies');
--     if (error) console.error('Cleanup failed:', error);
--     else if (data?.length) console.log('Cleaned up lobbies:', data);
--     return new Response(JSON.stringify({ cleaned: data?.length || 0 }), { status: 200 });
--   });
