import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import { smartSelectQuestions } from "../lib/smartSelection";
import AvatarPicker from "./ui/AvatarPicker";
import CodeInput from "./ui/CodeInput";
import ClayButton from "./ui/ClayButton";
import SettingsPanel from "./ui/SettingsPanel";
import { AVATARS, getAvatar } from "../assets/avatars";
import {
  Play,
  Users,
  User,
  LogIn,
  Sparkles,
  BookOpen,
  Swords,
  Check,
  X,
} from "lucide-react";

// ── Category type ──────────────────────────────────────────────────────
interface Category {
  id: string;
  name: string;
  data?: any[];
  main_category?: string;
  tags?: string[];
}

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
  const [showSolo, setShowSolo] = useState(false);
  const [isHosting, setIsHosting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinStatus, setJoinStatus] = useState("");

  // Solo setup state
  const [categories, setCategories] = useState<Category[]>([]);
  const [fetchingCats, setFetchingCats] = useState(false);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [soloRounds, setSoloRounds] = useState(3);
  const [soloTimer, setSoloTimer] = useState(15);
  const [isStartingSolo, setIsStartingSolo] = useState(false);
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // ── Fetch categories when solo panel opens ──────────────────────────
  const openSolo = useCallback(async () => {
    setShowSolo(true);
    setShowJoin(false);
    if (categories.length > 0) return;
    setFetchingCats(true);
    const { data } = await supabase.from("categories_library").select("*");
    if (data) setCategories(data);
    setFetchingCats(false);
  }, [categories.length]);

  const toggleCategory = useCallback((id: string) => {
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";

      let code = "";
      let success = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        code = "";
        for (let i = 0; i < 6; i++) {
          code += chars[Math.floor(Math.random() * chars.length)];
        }

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
      .replace(/O/g, "Q")
      .replace(/0/g, "Q")
      .replace(/I/g, "L")
      .replace(/1/g, "L")
      .replace(/[^A-Z0-9]/g, "");
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

  // ── Solo Start ──────────────────────────────────────────────────────
  const handleSoloStart = useCallback(async () => {
    if (selectedCats.size === 0 || !playerName.trim()) return;
    setIsStartingSolo(true);

    try {
      store.setPlayerName(playerName.trim());
      store.ensurePlayerId();

      const chosenCategories = categories.filter((c) => selectedCats.has(c.id));

      // Process each category through smart selection
      const processedCategories: Record<number, any[]> = {};
      for (let r = 1; r <= soloRounds; r++) {
        const roundCats = [];
        for (const cat of chosenCategories) {
          const questions = await smartSelectQuestions(
            cat.data || [],
            cat.name,
            5,
            "qb_solo_history",
          );
          roundCats.push({ ...cat, data: questions });
        }
        processedCategories[r] = roundCats;
      }

      const settings = {
        rounds: soloRounds,
        categoriesPerRound: chosenCategories.length,
        timer: soloTimer,
        players: [
          {
            id: crypto.randomUUID(),
            name: playerName.trim(),
            score: 0,
          },
        ],
        round_categories: processedCategories,
      };

      store.setLocalGameSettings(settings);
      navigate("/local");
    } catch (err) {
      console.error("Solo start error:", err);
    } finally {
      setIsStartingSolo(false);
    }
  }, [selectedCats, playerName, categories, soloRounds, soloTimer, navigate]);

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-4 sm:p-6 gap-5">
      {/* Settings panel */}
      <div className="absolute top-4 right-4 z-40">
        <SettingsPanel />
      </div>

      {/* ── Branding ───────────────────────────────────────────────── */}
      <div className="animate-clay-pop flex flex-col items-center gap-2">
        <div className="clay-avatar w-16 h-16 rounded-2xl flex items-center justify-center bg-soft-purple">
          <span className="text-white text-2xl font-black font-outfit">QG</span>
        </div>
        <h1 className="font-outfit font-black text-3xl sm:text-4xl text-plum tracking-tight">
          {t('home.title')}
        </h1>
        <p className="text-xs text-plum/60 font-medium">{t('home.tagline')}</p>
      </div>

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

      {/* ── Game Mode Grid (2x2) ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full max-w-md">
        {/* Host Card */}
        <button
          onClick={() => {
            setShowJoin(false);
            setShowSolo(false);
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
            setShowSolo(false);
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
          onClick={openSolo}
          className={`clay p-5 flex flex-col items-center gap-3 text-center cursor-pointer
                     hover:-translate-y-1 transition-all animate-clay-pop
                     bg-gradient-to-br from-mint-light/40 to-transparent
                     ${showSolo ? "ring-2 ring-mint shadow-lg shadow-mint/20" : ""}`}
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

      {/* ── Join Panel ───────────────────────────────────────────────── */}
      {showJoin && (
        <div className="clay-elevated p-5 w-full max-w-md flex flex-col gap-4 animate-clay-pop">
          <div className="flex items-center justify-between">
            <h3 className="font-outfit font-black text-sm text-plum">
              {t('home.joinGameTitle')}
            </h3>
            <button
              onClick={() => {
                setShowJoin(false);
                setJoinCode("");
              }}
              className="p-1 text-plum/50 hover:text-plum transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <CodeInput value={joinCode} onChange={setJoinCode} length={6} />
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
      )}

      {/* ── Solo Setup Panel ─────────────────────────────────────────── */}
      {showSolo && (
        <div className="clay-elevated p-5 w-full max-w-md flex flex-col gap-4 animate-clay-pop">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="font-outfit font-black text-sm text-plum">
              {t('home.soloSetup')}
            </h3>
            <button
              onClick={() => {
                setShowSolo(false);
                setSelectedCats(new Set());
              }}
              className="p-1 text-plum/50 hover:text-plum transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Settings sliders */}
          <div className="flex gap-4">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-plum/60">
                {t('home.roundsLabel', { count: soloRounds })}
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={soloRounds}
                onChange={(e) => setSoloRounds(Number(e.target.value))}
                className="w-full accent-mint"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-plum/60">
                {t('home.timerLabel', { count: soloTimer })}
              </label>
              <input
                type="range"
                min={5}
                max={30}
                step={5}
                value={soloTimer}
                onChange={(e) => setSoloTimer(Number(e.target.value))}
                className="w-full accent-mint"
              />
            </div>
          </div>

          {/* Category grid */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-plum/60 mb-2">
              {t('home.pickCategories')} ({t('home.selected', { count: selectedCats.size })})
            </p>
            {fetchingCats ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 clay-skeleton rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto smooth-scroll">
                {categories.map((cat) => {
                  const isSelected = selectedCats.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleCategory(cat.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-left transition-all text-xs font-bold
                        ${
                          isSelected
                            ? "bg-mint text-white shadow-lg shadow-mint/20"
                            : "bg-cream text-plum/50 hover:text-plum border border-clay-border/50"
                        }`}
                    >
                      <span className="truncate flex-1">
                        {cat.name.replace(" (Arena)", "")}
                      </span>
                      {isSelected && <Check className="w-3 h-3 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Start button */}
          <ClayButton
            variant="primary"
            size="md"
            disabled={selectedCats.size === 0 || isStartingSolo}
            loading={isStartingSolo}
            icon={<Play className="w-4 h-4" />}
            onClick={handleSoloStart}
            className="w-full bg-mint hover:bg-mint/90"
          >
            {t('home.startSoloGame')}
          </ClayButton>
        </div>
      )}

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
