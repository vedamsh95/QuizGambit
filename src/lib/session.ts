/**
 * Unified session manager for QuizGambit v2.0.
 *
 * Replaces scattered localStorage keys (host_lobby_code, arena_host_code, etc.)
 * with a single `qb_session` object that tracks:
 *   - Player identity (persistent across sessions)
 *   - Active lobby reference (code, role, mode)
 *   - Auto-restore on refresh
 *
 * On first load, migrates v1 keys into the unified session automatically.
 */

// ── Session Shape ───────────────────────────────────────────────────────────

export interface ActiveLobby {
  code: string;
  role: "host" | "player";
  mode: "STANDARD" | "ARENA";
}

interface SessionData {
  playerId: string;
  playerName: string;
  activeLobby: ActiveLobby | null;
}

// ── Keys ────────────────────────────────────────────────────────────────────

const SESSION_KEY = "qb_session";

const V1_KEYS = [
  "host_lobby_code",
  "arena_host_code",
  "arena_host_id",
  "qb_pid",
  "qb_player_name",
] as const;

// ── Core API ────────────────────────────────────────────────────────────────

export const session = {
  /** Read the full session object */
  get(): SessionData | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SessionData;
    } catch {
      return null;
    }
  },

  /** Write the full session object */
  set(data: SessionData): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  },

  /** Get or create a persistent player ID. Runs v1 migration first if needed. */
  ensurePlayerId(): string {
    // Always migrate first to avoid orphaning v1 keys
    this.migrateFromV1();

    const existing = this.get()?.playerId;
    if (existing) return existing;

    // Try v1 key as fallback
    const v1Pid = localStorage.getItem("qb_pid");
    const playerId = v1Pid || crypto.randomUUID();
    this.set({
      playerId,
      playerName: this.getPlayerName(),
      activeLobby: this.getActiveLobby(),
    });
    return playerId;
  },

  /** Get the player's display name */
  getPlayerName(): string {
    return this.get()?.playerName
      || localStorage.getItem("qb_player_name")
      || "";
  },

  /** Set the player's display name */
  setPlayerName(name: string): void {
    const current = this.get();
    this.set({
      playerId: current?.playerId || crypto.randomUUID(),
      playerName: name,
      activeLobby: current?.activeLobby || null,
    });
  },

  /** Get the active lobby reference */
  getActiveLobby(): ActiveLobby | null {
    return this.get()?.activeLobby || null;
  },

  /** Set the active lobby (join/create) */
  setActiveLobby(lobby: ActiveLobby): void {
    const current = this.get();
    this.set({
      playerId: current?.playerId || crypto.randomUUID(),
      playerName: current?.playerName || "",
      activeLobby: lobby,
    });
  },

  /** Clear the active lobby (leave/end game) */
  clearActiveLobby(): void {
    const current = this.get();
    if (!current) return;
    this.set({
      playerId: current.playerId,
      playerName: current.playerName,
      activeLobby: null,
    });
  },

  /** Clear the entire session (full logout/reset) */
  clearAll(): void {
    localStorage.removeItem(SESSION_KEY);
    V1_KEYS.forEach((k) => localStorage.removeItem(k));

    // Also clear sessionStorage keys
    ["qb_ai_provider", "qb_ai_keys", "qb_local_game"].forEach((k) =>
      sessionStorage.removeItem(k),
    );
  },

  // ── Migration ──────────────────────────────────────────────────────────

  /**
   * Migrate v1 localStorage keys into the unified v2 session.
   * Safe to call multiple times — only migrates if no v2 session exists.
   */
  migrateFromV1(): boolean {
    if (this.get()) return false; // Already migrated

    const playerId = localStorage.getItem("qb_pid") || crypto.randomUUID();
    const playerName = localStorage.getItem("qb_player_name") || "";

    // Detect active lobby from v1 host keys
    let activeLobby: ActiveLobby | null = null;

    const standardCode = localStorage.getItem("host_lobby_code");
    if (standardCode) {
      activeLobby = { code: standardCode, role: "host", mode: "STANDARD" };
    } else {
      const arenaCode = localStorage.getItem("arena_host_code");
      if (arenaCode) {
        activeLobby = { code: arenaCode, role: "host", mode: "ARENA" };
      }
    }

    this.set({ playerId, playerName, activeLobby });

    // Clean old v1 host keys (keep qb_pid and qb_player_name for v1 components until full migration)
    localStorage.removeItem("host_lobby_code");
    localStorage.removeItem("arena_host_code");
    localStorage.removeItem("arena_host_id");

    return true;
  },
};
