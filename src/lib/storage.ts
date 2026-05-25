/**
 * Centralized storage store — single source of truth for all client-side persistence.
 *
 * Replaces scattered localStorage.getItem/setItem/removeItem calls across the codebase.
 * Uses localStorage for persistent data, sessionStorage for sensitive/temporary data.
 */

// ── Player Identity ────────────────────────────────────────────────────────

export const store = {
  // Player ID (persistent across sessions — identifies returning players)
  getPlayerId(): string | null {
    return localStorage.getItem("qb_pid");
  },
  setPlayerId(id: string): void {
    localStorage.setItem("qb_pid", id);
  },
  ensurePlayerId(): string {
    const existing = this.getPlayerId();
    if (existing) return existing;
    const newId = crypto.randomUUID();
    this.setPlayerId(newId);
    return newId;
  },

  // Player Name (persistent — auto-fills join forms)
  getPlayerName(): string {
    return localStorage.getItem("qb_player_name") || "";
  },
  setPlayerName(name: string): void {
    localStorage.setItem("qb_player_name", name);
  },

  // Player Avatar (persistent — auto-selects on return)
  getPlayerAvatar(): string {
    return localStorage.getItem("qb_player_avatar") || "brain";
  },
  setPlayerAvatar(avatar: string): void {
    localStorage.setItem("qb_player_avatar", avatar);
  },

  // ── Host Lobby Persistence ──────────────────────────────────────────────

  getHostLobbyCode(): string | null {
    return localStorage.getItem("host_lobby_code");
  },
  setHostLobbyCode(code: string): void {
    localStorage.setItem("host_lobby_code", code);
  },
  clearHostLobbyCode(): void {
    localStorage.removeItem("host_lobby_code");
  },

  // ── Arena Host Persistence ──────────────────────────────────────────────

  getArenaHostCode(): string | null {
    return localStorage.getItem("arena_host_code");
  },
  setArenaHostCode(code: string): void {
    localStorage.setItem("arena_host_code", code);
  },
  clearArenaHostCode(): void {
    localStorage.removeItem("arena_host_code");
  },

  getArenaHostId(): string | null {
    return localStorage.getItem("arena_host_id");
  },
  setArenaHostId(id: string): void {
    localStorage.setItem("arena_host_id", id);
  },
  clearArenaHostId(): void {
    localStorage.removeItem("arena_host_id");
  },

  // ── AI API Keys (sessionStorage — cleared on tab close for security) ─────

  getAiProvider(): string {
    return sessionStorage.getItem("qb_ai_provider") || localStorage.getItem("qb_ai_provider") || "gemini";
  },
  setAiProvider(provider: string): void {
    sessionStorage.setItem("qb_ai_provider", provider);
    localStorage.setItem("qb_ai_provider", provider); // mirror for display prefs
  },

  getAiKeys(): Record<string, string> {
    try {
      const session = sessionStorage.getItem("qb_ai_keys");
      if (session) return JSON.parse(session);
      const local = localStorage.getItem("qb_ai_keys");
      if (local) return JSON.parse(local);
    } catch { /* ignore parse errors */ }
    return {};
  },
  setAiKeys(keys: Record<string, string>): void {
    sessionStorage.setItem("qb_ai_keys", JSON.stringify(keys));
    localStorage.setItem("qb_ai_keys", JSON.stringify(keys)); // mirror so Home.tsx can read prefs
  },

  getAiKeyForProvider(provider: string): string {
    return this.getAiKeys()[provider] || "";
  },
  setAiKeyForProvider(provider: string, key: string): void {
    const keys = this.getAiKeys();
    keys[provider] = key;
    this.setAiKeys(keys);
  },

  // ── Local Play Persistence (sessionStorage — survives refresh, not tab close) ──

  getLocalGameSettings(): any | null {
    try {
      const stored = sessionStorage.getItem("qb_local_game");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },
  setLocalGameSettings(settings: any): void {
    sessionStorage.setItem("qb_local_game", JSON.stringify(settings));
  },
  clearLocalGameSettings(): void {
    sessionStorage.removeItem("qb_local_game");
  },

  // ── Session Cleanup ─────────────────────────────────────────────────────

  /** Clear all QuizGambit data from storage */
  clearAll(): void {
    const localStorageKeys = [
      "qb_pid",
      "qb_player_name",
      "host_lobby_code",
      "arena_host_code",
      "arena_host_id",
      "qb_ai_provider",
      "qb_ai_keys",
    ];
    localStorageKeys.forEach((k) => localStorage.removeItem(k));

    const sessionStorageKeys = [
      "qb_ai_provider",
      "qb_ai_keys",
      "qb_local_game",
    ];
    sessionStorageKeys.forEach((k) => sessionStorage.removeItem(k));
  },
};
