import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ── Types ───────────────────────────────────────────────────────────────────

/** Shape of presence data each client tracks */
export interface PlayerPresence {
  playerId: string
  name: string
  status: 'connected' | 'away'
  lastSeen: number // Date.now()
}

/** Map of playerId → latest presence snapshot */
export type PresenceMap = Record<string, PlayerPresence>

/** Handler for incoming broadcast events */
export type BroadcastHandler = (payload: any) => void

/** Broadcast events the hook can emit */
export interface BroadcastEvents {
  'answer:submit': { playerId: string; answer: string; questionId: string }
  'answer:result': { questionId: string; results: any[] }
  'buzzer:press': { playerId: string }
  'buzzer:clear': Record<string, never>
  'timer:tick': { remainingSec: number }
  'timer:expired': { questionId: string }
  'turn:next': { nextPickerId: string }
  'question:open': { questionId: string; category: string; points: number }
  'question:close': { questionId: string }
  'phase:change': { phase: string; data?: any }
  'heartbeat': { playerId: string }
  'score:update': { playerId: string; score: number }
  'settings:update': Record<string, any>
  'draft:pick': { playerId: string; playerName: string; categoryId: string; categoryName: string }
  'draft:start': { turnIndex: number; totalSlots: number }
  'draft:turn': { turnIndex: number }
  'draft:complete': { picks: any[] }
  'draft:sync': { picks: any[]; turnIndex: number; phase: string }
  'game:start': Record<string, never>
  'game:end': Record<string, never>
  'player:join': { playerId: string; playerName: string }
  'player:leave': { playerId: string }
  'buzz:timestamp': { playerId: string; playerName: string; buzzTime: number }
  'vote:submit': { playerId: string; mode: string }
  'letter:select': { playerId: string; letter: string; letters: string[]; phase: string }
  'poison:assign': { playerId: string }
  'word:claim': { id: string; playerId: string; playerName: string; word: string; points: number }
  'player:penalized': { playerId: string; heartsRemaining: number; phase: string }
  'player:typing': { playerId: string; input: string }
}

export type BroadcastEventName = keyof BroadcastEvents

/** Options for configuring the realtime channel */
export interface UseRealtimeChannelOptions {
  /** Unique channel name (e.g., `arena:ABCD`) */
  channelName: string
  /** Whether to enable presence tracking */
  enablePresence?: boolean
  /** Presence data to track for this client */
  presenceData?: Omit<PlayerPresence, 'lastSeen'>
  /** Whether to subscribe to postgres_changes (lobby table) */
  subscribeLobby?: string // lobby code to filter on
  /** Whether to subscribe to postgres_changes (players table) */
  subscribePlayers?: string // lobby code to filter on
  /** Whether to subscribe to postgres_changes (arena_answers table) */
  subscribeArenaAnswers?: string // lobby code to filter on
  /** Override the answers table name (default: 'arena_answers') */
  answersTableName?: string
  /** Handlers for lobby table changes (payload.new may be null on DELETE) */
  onLobbyChange?: (payload: any) => void
  /** Handlers for player table changes */
  onPlayerChange?: () => void
  /** Handlers for arena_answers inserts */
  onArenaAnswer?: (payload: any) => void
  /** Called when the channel connects or reconnects — use to re-fetch stale state */
  onReconnect?: () => void
}

export interface UseRealtimeChannelReturn {
  /** Send a broadcast event to all peers */
  broadcast: (event: BroadcastEventName, payload: any) => void
  /** Register a handler for a broadcast event */
  onBroadcast: (event: BroadcastEventName, handler: BroadcastHandler) => () => void
  /** Current presence map of all connected players */
  presences: PresenceMap
  /** Whether the WebSocket channel is connected */
  isConnected: boolean
  /** The underlying channel reference */
  channel: RealtimeChannel | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function flattenPresence(state: Record<string, any[]>): PresenceMap {
  const map: PresenceMap = {}
  for (const [_key, entries] of Object.entries(state)) {
    if (entries && entries.length > 0) {
      const latest = entries[entries.length - 1] as PlayerPresence
      map[latest.playerId] = latest
    }
  }
  return map
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRealtimeChannel(
  options: UseRealtimeChannelOptions
): UseRealtimeChannelReturn {
  const {
    channelName,
    enablePresence = false,
    presenceData,
    subscribeLobby,
    subscribePlayers,
    subscribeArenaAnswers,
    answersTableName = 'arena_answers',
    onLobbyChange,
    onPlayerChange,
    onArenaAnswer,
    onReconnect,
  } = options

  const channelRef = useRef<RealtimeChannel | null>(null)
  const isConnectedRef = useRef(false)
  const [presences, setPresences] = useState<PresenceMap>({})
  const [isConnected, setIsConnected] = useState(false)
  const broadcastHandlersRef = useRef<Map<BroadcastEventName, Set<BroadcastHandler>>>(
    new Map()
  )
  // Guard against duplicate subscription setups
  const subscribedRef = useRef(false)
  // Reconnect tracking — logs warning on rapid close/reconnect loops
  const reconnectCountRef = useRef(0)
  // Track intentional cleanup (StrictMode unmount) to suppress CLOSED warnings
  const isCleaningUpRef = useRef(false)

  // ── Callback refs — always dispatch to latest callbacks (fixes stale closures) ──

  const onLobbyChangeRef = useRef(onLobbyChange)
  const onPlayerChangeRef = useRef(onPlayerChange)
  const onArenaAnswerRef = useRef(onArenaAnswer)
  const onReconnectRef = useRef(onReconnect)

  useEffect(() => { onLobbyChangeRef.current = onLobbyChange })
  useEffect(() => { onPlayerChangeRef.current = onPlayerChange })
  useEffect(() => { onArenaAnswerRef.current = onArenaAnswer })
  useEffect(() => { onReconnectRef.current = onReconnect })

  // ── Safe broadcast queue (only for idempotent join/leave events) ──────────

  const pendingBroadcastsRef = useRef<Array<{ event: BroadcastEventName; payload: any }>>([])

  const flushPendingBroadcasts = useCallback(() => {
    if (!channelRef.current || !isConnectedRef.current) return
    const pending = pendingBroadcastsRef.current
    pendingBroadcastsRef.current = []
    for (const { event, payload } of pending) {
      channelRef.current
        .send({ type: 'broadcast', event: event as string, payload })
        .catch((err) => {
          console.error(`[Realtime] Flushed broadcast error (${event}):`, err)
        })
    }
  }, [])

  // ── Broadcast dispatch ──────────────────────────────────────────────────

  const broadcast = useCallback(
    (event: BroadcastEventName, payload: any) => {
      if (channelRef.current && isConnectedRef.current) {
        channelRef.current
          .send({
            type: 'broadcast',
            event: event as string,
            payload,
          })
          .catch((err) => {
            console.error(`[Realtime] Broadcast send error (${event}):`, err)
          })
      } else {
        // Queue safe events (player:join, player:leave) for delivery on connect
        if (event === 'player:join' || event === 'player:leave') {
          pendingBroadcastsRef.current.push({ event, payload })
        }
        // Non-critical broadcasts silently dropped — channel will reconnect shortly
      }
    },
    [] // Stable ref-based, no dependencies needed
  )

  // ── Register / unregister broadcast handlers ────────────────────────────

  const onBroadcast = useCallback(
    (event: BroadcastEventName, handler: BroadcastHandler): (() => void) => {
      const handlers = broadcastHandlersRef.current
      if (!handlers.has(event)) {
        handlers.set(event, new Set())
      }
      handlers.get(event)!.add(handler)

      return () => {
        handlers.get(event)?.delete(handler)
      }
    },
    []
  )

  // ── Heartbeat (periodic presence refresh) ───────────────────────────────

  useEffect(() => {
    if (!enablePresence || !presenceData || !isConnected) return

    const interval = setInterval(() => {
      if (channelRef.current) {
        channelRef.current
          .track({
            ...presenceData,
            lastSeen: Date.now(),
          } as never)
          .catch(() => {
            // Silently ignore — channel will recover on next interval
          })
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [enablePresence, presenceData, isConnected])

  // ── Channel lifecycle ───────────────────────────────────────────────────

  useEffect(() => {
    // Prevent duplicate subscriptions (React StrictMode double-mount)
    if (subscribedRef.current) return
    subscribedRef.current = true

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true }, // Receive own broadcasts for consistency
        presence: enablePresence ? { key: presenceData?.playerId || channelName } : undefined,
      },
    })

    channelRef.current = channel

    // ── Broadcast listener (single handler dispatches to registered listeners) ──

    channel.on('broadcast', { event: '*' }, (msg) => {
      const event = msg.event as BroadcastEventName
      const payload = msg.payload
      const handlers = broadcastHandlersRef.current.get(event)
      if (handlers) {
        handlers.forEach((fn) => {
          try {
            fn(payload)
          } catch (err) {
            console.error(`[Realtime] Handler error for "${event}":`, err)
          }
        })
      }
    })

    // ── Presence ─────────────────────────────────────────────────────────

    if (enablePresence) {
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setPresences(flattenPresence(state))
      })

      channel.on('presence', { event: 'join' }, () => {
        const state = channel.presenceState()
        setPresences(flattenPresence(state))
      })

      channel.on('presence', { event: 'leave' }, () => {
        const state = channel.presenceState()
        setPresences(flattenPresence(state))
      })
    }

    // ── postgres_changes: lobby (UPDATE + DELETE) ──────────────────────

    if (subscribeLobby) {
      channel.on(
        'postgres_changes',
        {
          event: '*',  // catch UPDATE and DELETE
          schema: 'public',
          table: 'lobbies',
          filter: `code=eq.${subscribeLobby}`,
        },
        (payload) => {
          // DELETE — lobby removed (host left)
          if (payload.eventType === 'DELETE') {
            onLobbyChangeRef.current?.({ new: null, eventType: 'DELETE' })
            return
          }
          // UPDATE — lobby changed
          onLobbyChangeRef.current?.(payload)
        }
      )
    }

    // ── postgres_changes: players (INSERT/UPDATE/DELETE) ────────────────

    if (subscribePlayers) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `lobby_code=eq.${subscribePlayers}`,
        },
        () => {
          onPlayerChangeRef.current?.()
        }
      )
    }

    // ── postgres_changes: arena_answers (INSERT only) ────────────────────

    if (subscribeArenaAnswers) {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',            table: answersTableName,
            filter: `lobby_code=eq.${subscribeArenaAnswers}`,
        },
        (payload) => {
          onArenaAnswerRef.current?.(payload)
        }
      )
    }

    // ── Connection lifecycle ─────────────────────────────────────────────

    channel.subscribe(async (status: string) => {
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // Suppress warning if this close is from our own cleanup (StrictMode unmount)
        if (isCleaningUpRef.current) {
          isCleaningUpRef.current = false
          return
        }
        reconnectCountRef.current += 1
        const count = reconnectCountRef.current
        if (count <= 5) {
          console.warn(`[Realtime] Channel "${channelName}" ${status} (reconnect #${count})`)
        } else if (count % 10 === 0) {
          console.warn(`[Realtime] Channel "${channelName}" ${status} (reconnect #${count}) — frequent disconnects; check supabase_realtime publication`)
        }
        isConnectedRef.current = false
        setIsConnected(false)
      } else if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Channel "${channelName}" connected`)
        reconnectCountRef.current = 0
        isConnectedRef.current = true
        setIsConnected(true)

        // Initial presence track
        if (enablePresence && presenceData) {
          await channel.track({
            ...presenceData,
            lastSeen: Date.now(),
          } as never)
        }

        // Flush queued safe broadcasts (player:join, player:leave)
        flushPendingBroadcasts()

        // Re-fetch stale state after reconnection
        onReconnectRef.current?.()
      }
    })

    return () => {
      // Mark as intentional cleanup so the CLOSED handler doesn't warn
      // (handles StrictMode double-mount teardown without console spam)
      isCleaningUpRef.current = true
      subscribedRef.current = false
      broadcastHandlersRef.current.clear()
      pendingBroadcastsRef.current = []
      isConnectedRef.current = false
      supabase.removeChannel(channel)
      setIsConnected(false)
    }
    // Only re-create if channelName changes — callbacks are stable via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName])

  return {
    broadcast,
    onBroadcast,
    presences,
    isConnected,
    channel: channelRef.current,
  }
}
