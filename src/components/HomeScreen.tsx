import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { pickLobbyCode } from "../lib/lobbyCodes";
import AvatarPicker from "./ui/AvatarPicker";
import CodeInput from "./ui/CodeInput";
import ClayButton from "./ui/ClayButton";
import SettingsPanel from "./ui/SettingsPanel";
import { AVATARS, getAvatar } from "../assets/avatars";
import {
  Users,
  User,
  LogIn,
  Sparkles,
  BookOpen,
  Swords,
  X,
} from "lucide-react";
import FrayLogo from "./ui/FrayLogo";

// ── HomeScreen ─────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────
  const [avatar, setAvatar] = useState(() => {
    const stored = store.getPlayerAvatar();
    // On first visit (no stored avatar or still "brain" default), assign random
    if (!stored || stored === "brain") {
      const rand = AVATARS[Math.floor(Math.random() * AVATARS.length)];
      store.setPlayerAvatar(rand.key);
      return rand.key;
    }
    return stored;
  });
  const [playerName, setPlayerName] = useState(() => store.getPlayerName());
  const [joinCode, setJoinCode] = useState("");
  const [showJoin, setShowJoin] = useState(false);
  const [isHosting, setIsHosting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState("");
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────
  const handleAvatarSelect = useCallback((key: string) => {
    setAvatar(key);
    store.setPlayerAvatar(key);
  }, []);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPlayerName(e.target.value);
    },
    [],
  );

  const nameValid = playerName.trim().length >= 2;

  // ── Host → Create lobby (mode selected inside the unified lobby) ─────
  const handleHost = useCallback(async () => {
    if (!playerName.trim()) return;
    setIsHosting(true);
    store.setPlayerName(playerName.trim());
    const playerId = store.ensurePlayerId();

    try {
      let code = "";
      let success = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        code = await pickLobbyCode();

        const { error } = await supabase.from("lobbies").insert({
          code,
          host_id: playerId,
          status: "LOBBY",
          mode: null,        // mode picked inside the lobby
          settings: {},
        });

        if (!error) {
          success = true;
          break;
        }
        if (error.code !== "23505") {
          console.error("Failed to create lobby:", error);
          return;
        }
      }

      if (!success) {
        console.error("Failed to generate unique room code after 5 attempts");
        return;
      }

      await supabase.from("players").upsert(
        {
          id: playerId,
          lobby_code: code,
          name: playerName.trim(),
          score: 0,
          joined_at: new Date().toISOString(),
          metadata: { avatar, is_host: true },
        },
        { onConflict: "id" },
      );

      store.setHostLobbyCode(code);
      navigate(`/lobby/${code}`);
    } catch (err) {
      console.error("Host error:", err);
    } finally {
      setIsHosting(false);
    }
  }, [playerName, avatar, navigate]);

  // ── Join ────────────────────────────────────────────────────────────
  const handleJoin = useCallback(async () => {
    const cleanCode = joinCode
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    if (cleanCode.length !== 6) return;
    if (!playerName.trim()) return;

    setIsJoining(true);
    setJoinStatus("Looking up game...");
    store.setPlayerName(playerName.trim());
    store.ensurePlayerId();      try {
      // Check the lobby mode to route to the correct page
      const { data: lobby, error } = await supabase
        .from("lobbies")
        .select("mode, code")
        .eq("code", cleanCode)
        .single();

      if (error || !lobby) {
        navigate(`/lobby/${cleanCode}`);
        return;
      }

      // Arena lobbies still use the arena route
      if (lobby.mode === "ARENA") {
        navigate(`/arena`);
      } else if (lobby.mode === "BUZZER" || lobby.mode === "LOCAL_BUZZER") {
        // Buzzer game already in progress — go to buzzer player view
        navigate(`/buzzer/${cleanCode}`);
      } else if (lobby.mode === "STANDARD" || lobby.mode === "LOCAL") {
        // Game in progress — go to play
        navigate(`/play/${cleanCode}`);
      } else {
        // mode is null — game hasn't started yet, join the unified lobby
        navigate(`/lobby/${cleanCode}`);
      }
    } catch {
      navigate(`/lobby/${cleanCode}`);
    } finally {
      setIsJoining(false);
      setJoinStatus("");
    }
  }, [joinCode, playerName, navigate]);

  const joinValid = joinCode.replace(/[^A-Z0-9]/g, "").length === 6;



  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-4 sm:p-6 gap-5">
      {/* Settings panel */}
      <div className="absolute top-4 right-4 z-40">
        <SettingsPanel />
      </div>

      {/* ── Branding: PlayFray ────────────────────────────────────── */}
      <FrayLogo size="lg" showTagline={false} />

      {/* ── Tagline ──────────────────────────────────────────────── */}
      <p className="text-base sm:text-lg font-outfit font-bold text-transparent bg-clip-text bg-gradient-to-r from-soft-purple via-lavender to-soft-purple/70 tracking-[0.06em]">
        {t('home.tagline')}
      </p>

      {/* ── Name Input with Avatar Beside ─────────────────────────── */}
      <div className="w-full max-w-md flex items-center gap-3">
        {/* Avatar button — themed gradient bg, white SVG circle, purple border */}
        <button
          onClick={() => setShowAvatarModal(true)}
          className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 ring-2 ring-soft-purple ring-offset-2 ring-offset-clay-cream transition-all hover:scale-110 hover:shadow-xl hover:ring-soft-purple/80 active:scale-95 group"
          style={{
            background: "linear-gradient(135deg, #7C5CFC 0%, #A78BFA 100%)",
          }}
          title={t('home.changeAvatar')}
        >
          {/* White circle behind the SVG icon for contrast */}
          <span className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-inner">
            <img
              src={getAvatar(avatar).src}
              alt={getAvatar(avatar).label}
              className="w-9 h-9 transition-transform group-hover:rotate-12"
            />
          </span>
        </button>
        <input
          type="text"
          value={playerName}
          onChange={handleNameChange}
          placeholder={t('home.namePlaceholder')}
          maxLength={24}
          className="clay-input text-base font-bold font-outfit flex-1"
          autoComplete="off"
        />
      </div>

      {/* ── Game Mode Grid (2x2) or Join Panel ────────────────────── */}
      <div className="w-full max-w-md relative min-h-[200px]">
        {/* Join panel slides in over the grid */}
        <div className={`transition-all duration-500 ease-out ${
          showJoin ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95 pointer-events-none absolute inset-0"
        }`}>
          <div className="clay-elevated p-5 w-full flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-outfit font-black text-sm text-plum">
                {t('home.joinGameTitle')}
              </h3>
              <button
                onClick={() => {
                  setShowJoin(false);
                  setJoinCode("");
                }}
                className="flex items-center gap-1 text-xs font-bold text-plum/50 hover:text-plum transition-colors"
              >
                <X className="w-4 h-4" />
                <span className="hidden sm:inline">Back</span>
              </button>
            </div>
            <CodeInput value={joinCode} onChange={setJoinCode} onSubmit={handleJoin} length={6} />
            <div className="flex gap-2">
              <ClayButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowJoin(false);
                  setJoinCode("");
                }}
                className="flex-1"
              >
                {t('common.cancel')}
              </ClayButton>
              <ClayButton
                variant="primary"
                size="sm"
                disabled={!joinValid || !nameValid || isJoining}
                loading={isJoining}
                onClick={handleJoin}
                className="flex-1"
              >
                {t('home.join')}
              </ClayButton>
            </div>
            {joinStatus && (
              <p className="text-center text-[10px] font-bold text-soft-purple animate-pulse">
                {joinStatus}
              </p>
            )}
          </div>
        </div>

        {/* 2x2 Grid — fades out when join panel is open */}
        <div className={`grid grid-cols-2 gap-3 sm:gap-4 transition-all duration-500 ease-out ${
          showJoin ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
        }`}>
        {/* Host Card */}
        <button
          onClick={() => {
            setShowJoin(false);
            handleHost();
          }}
          disabled={!nameValid || isHosting}
          className="clay p-5 flex flex-col items-center gap-3 text-center cursor-pointer
                     hover:-translate-y-1 transition-all disabled:opacity-40 disabled:cursor-not-allowed
                     animate-clay-pop bg-gradient-to-br from-soft-purple-light/40 to-transparent"
          style={{ animationDelay: "0ms" }}
        >
          <div className="w-11 h-11 rounded-xl bg-soft-purple flex items-center justify-center">
            {isHosting ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
            ) : (
              <Users className="w-5 h-5 text-white" />
            )}
          </div>
          <h3 className="font-outfit font-black text-sm text-plum">{t('home.host')}</h3>
          <p className="text-xs text-plum/60 font-medium leading-tight">
            {t('home.hostDesc')}
          </p>
        </button>

        {/* Join Card */}
        <button
          onClick={() => {
            setShowJoin((p) => !p);
          }}
          className={`clay p-5 flex flex-col items-center gap-3 text-center cursor-pointer
                     hover:-translate-y-1 transition-all animate-clay-pop
                     bg-gradient-to-br from-sky-light/40 to-transparent
                     ${showJoin ? "ring-2 ring-sky shadow-lg shadow-sky/20" : ""}`}
          style={{ animationDelay: "50ms" }}
        >
          <div className="w-11 h-11 rounded-xl bg-sky flex items-center justify-center">
            <LogIn className="w-5 h-5 text-white" />
          </div>
          <h3 className="font-outfit font-black text-sm text-plum">{t('home.join')}</h3>
          <p className="text-xs text-plum/60 font-medium leading-tight">
            {t('home.joinDesc')}
          </p>
        </button>

        {/* Play Solo Card */}
        <button
          onClick={() => {
            setShowJoin(false);
            navigate("/solo");
          }}
          className="clay p-5 flex flex-col items-center gap-3 text-center cursor-pointer
                     hover:-translate-y-1 transition-all animate-clay-pop
                     bg-gradient-to-br from-mint-light/40 to-transparent"
          style={{ animationDelay: "100ms" }}
        >
          <div className="w-11 h-11 rounded-xl bg-mint flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <h3 className="font-outfit font-black text-sm text-plum">{t('home.playSolo')}</h3>
          <p className="text-xs text-plum/60 font-medium leading-tight">
            {t('home.playSoloDesc')}
          </p>
        </button>

        {/* AI Gen Card */}
        <button
          onClick={() => navigate("/ai")}
          className="clay p-5 flex flex-col items-center gap-3 text-center cursor-pointer
                     hover:-translate-y-1 transition-all animate-clay-pop
                     bg-gradient-to-br from-butter-light/40 to-transparent"
          style={{ animationDelay: "150ms" }}
        >
          <div className="w-11 h-11 rounded-xl bg-butter flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h3 className="font-outfit font-black text-sm text-plum">{t('home.aiGen')}</h3>
          <p className="text-xs text-plum/60 font-medium leading-tight">
            {t('home.aiGenDesc')}
          </p>
        </button>
        </div>
      </div>

      {/* ...no more join panel below the grid */}



      {/* ── Avatar Selection Modal ─────────────────────────────────── */}
      {showAvatarModal && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-plum/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowAvatarModal(false); }}
        >
          <div className="clay-elevated p-6 rounded-[2.5rem] max-w-lg w-full animate-in zoom-in-95 duration-200 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-outfit font-black text-lg text-plum">{t('home.chooseAvatar')}</h3>
                <p className="text-xs text-plum/60 font-medium">
                  {getAvatar(avatar).label} · {getAvatar(avatar).theme}
                </p>
              </div>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="p-2 rounded-xl text-plum/50 hover:text-plum hover:bg-cream transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <AvatarPicker
              selected={avatar}
              onSelect={(key) => {
                handleAvatarSelect(key);
                setShowAvatarModal(false);
              }}
            />
          </div>
        </div>
      )}

      {/* ── Divider ──────────────────────────────────────────────────── */}
      <div className="w-full max-w-md flex items-center gap-3">
        <div className="flex-1 h-px bg-clay-border" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-plum/40">
          {t('home.more')}
        </span>
        <div className="flex-1 h-px bg-clay-border" />
      </div>

      {/* ── Secondary Actions (2 pill buttons: Library, Arena) ───────── */}
      <div className="flex items-center gap-3 w-full max-w-md justify-center">
        <button
          onClick={() => navigate("/library")}
          className="clay-btn flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-plum/70
                     hover:text-plum transition-all"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>{t('home.library')}</span>
        </button>

        <button
          onClick={() => navigate("/arena")}
          className="clay-btn flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-plum/70
                     hover:text-plum transition-all"
        >
          <Swords className="w-3.5 h-3.5" />
          <span>{t('home.arena')}</span>
        </button>
      </div>
    </div>
  );
}
