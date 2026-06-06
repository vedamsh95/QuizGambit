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

  // ── Arena Host Persistence (deprecated, kept for cleanup) ─────────────

  clearArenaHostCode(): void {
    localStorage.removeItem("arena_host_code");
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

  // ── Recent Topics (for AI generator quick-pick in Topic mode) ──────

  getRecentTopics(): string[] {
    try {
      const stored = localStorage.getItem("qb_recent_topics");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  addRecentTopic(topic: string): void {
    const trimmed = topic.trim();
    if (!trimmed) return;
    const current = this.getRecentTopics();
    const filtered = current.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...filtered].slice(0, 8);
    localStorage.setItem("qb_recent_topics", JSON.stringify(updated));
  },

  // ── Session Cleanup ─────────────────────────────────────────────────────

  /** Clear all QuizGambit data from storage */
  clearAll(): void {
    const localStorageKeys = [
      "qb_pid",
      "qb_player_name",
      "host_lobby_code",
      "qb_ai_provider",
      "qb_ai_keys",
      "qb_recent_themes",
      "qb_recent_topics",
    ];
    localStorageKeys.forEach((k) => localStorage.removeItem(k));

    const sessionStorageKeys = [
      "qb_ai_provider",
      "qb_ai_keys",
      "qb_local_game",
    ];
    sessionStorageKeys.forEach((k) => sessionStorage.removeItem(k));
  },

  // ── Recent Themes (for AI generator quick-pick) ───────────────────────

  /** Get recently used themes (max 8, most recent first, unique) */
  getRecentThemes(): string[] {
    try {
      const stored = localStorage.getItem("qb_recent_themes");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /** Add a theme to recent list (deduped, max 8, newest first) */
  addRecentTheme(theme: string): void {
    const trimmed = theme.trim();
    if (!trimmed) return;
    const current = this.getRecentThemes();
    const filtered = current.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...filtered].slice(0, 8);
    localStorage.setItem("qb_recent_themes", JSON.stringify(updated));
  },

  // ── Recent Categories (for category picker quick-access) ────────────

  /** Get recently used category IDs (max 8, most recent first, unique) */
  getRecentCategoryIds(): string[] {
    try {
      const stored = localStorage.getItem("qb_recent_categories");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  },

  /** Add a category ID to recent list (deduped, max 8, newest first) */
  addRecentCategory(categoryId: string): void {
    if (!categoryId) return;
    const current = this.getRecentCategoryIds();
    const filtered = current.filter((id) => id !== categoryId);
    const updated = [categoryId, ...filtered].slice(0, 8);
    localStorage.setItem("qb_recent_categories", JSON.stringify(updated));
  },
};
