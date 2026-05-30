import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useParams } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { store } from "./lib/storage";
import { ThemeProvider } from "./components/ui/ThemeProvider";
import { ToastProvider } from "./components/ui/ClayToast";

// ── V2 Components ───────────────────────────────────────────────────────
import HomeScreen from "./components/HomeScreen";
import UnifiedLobby from "./components/UnifiedLobby";
import GameResults from "./components/GameResults";

// ── V1 Components (kept for compatibility) ─────────────────────────────
import GameBoardV2 from "./components/GameBoardV2";
import ArenaBoard from "./components/ArenaBoard";
import SimultaneousBoard from "./components/SimultaneousBoard";
import ArenaLobby from "./components/ArenaLobby";
import Library from "./components/Library";
import AIGeneratorView from "./components/AIGeneratorView";
import AdminDashboard from "./components/AdminDashboard";
import LocalPlaySetupV2 from "./components/LocalPlaySetupV2";
import ClayPrototype from "./components/ClayPrototype";
import LinksBoardPrototype from "./components/LinksBoardPrototype";
import BuzzerPlayerView from "./components/BuzzerPlayerView";

// ── PlayRoute: fetches lobby data and renders GameBoard or ArenaBoard ───
function PlayRoute() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<{
    lobby?: any;
    loading: boolean;
    error?: string;
  }>({ loading: true });
  const playerId = store.ensurePlayerId();
  const playerName = store.getPlayerName();

  useEffect(() => {
    if (!code) {
      setState({ loading: false, error: "No game code provided" });
      return;
    }
    supabase
      .from("lobbies")
      .select("*")
      .eq("code", code)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setState({ loading: false, error: "Game not found" });
        } else {
          setState({ loading: false, lobby: data });
        }
      });
  }, [code]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" />
      </div>
    );
  }

  if (state.error || !state.lobby || !code) {
    return (
      <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-8 text-center gap-6">
        <h1 className="text-2xl font-outfit font-black text-plum">
          {state.error || "Game Not Found"}
        </h1>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 rounded-2xl bg-soft-purple text-white font-bold"
        >
          Return Home
        </button>
      </div>
    );
  }

  const lobby = state.lobby;

  // LINKS mode → LinksBoardPrototype (new clay design with full backend integration)
  if (lobby.mode === "LINKS") {
    return (
      <LinksBoardPrototype
        code={code}
        playerId={playerId}
        playerName={playerName}
      />
    );
  }

  // Simultaneous mode → SimultaneousBoard
  if (lobby.mode === "SIMULTANEOUS") {
    return (
      <SimultaneousBoard
        code={code}
        playerId={playerId}
        playerName={playerName}
      />
    );
  }

  // Arena mode → ArenaBoard
  if (lobby.mode === "ARENA") {
    return (
      <ArenaBoard
        code={code}
        playerId={playerId}
        playerName={playerName}
      />
    );
  }

  // Standard mode → GameBoard
  const handleExit = () => {
    navigate(`/results/${code}`);
  };

  const handleReturnToLobby = () => {
    navigate(`/lobby/${code}?from=game`);
  };

  return (
    <GameBoardV2
      lobbyCode={code}
      settings={lobby.settings}
      onExit={handleExit}
      onReturnToLobby={handleReturnToLobby}
    />
  );
}

// ── App ─────────────────────────────────────────────────────────────────
export default function App() {
  const navigate = useNavigate();
  const [adminState, setAdminState] = useState<"loading" | "yes" | "no">("loading");
  const [localSettings, setLocalSettings] = useState<any>(() =>
    store.getLocalGameSettings(),
  );

  // Auth + admin check
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkAdmin(session?.user?.id);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      checkAdmin(session?.user?.id);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const checkAdmin = async (userId?: string) => {
    if (!userId) return setAdminState("no");
    try {
      const { data } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userId)
        .single();
      setAdminState(data?.is_admin ? "yes" : "no");
    } catch {
      setAdminState("no");
    }
  };

  return (
    <ThemeProvider>
      <ToastProvider>
        <div className="min-h-screen bg-clay-cream">
          <Routes>
            {/* ── V2 Core Routes ─────────────────────────────────── */}
            <Route path="/" element={<HomeScreen />} />
            <Route path="/lobby/:code" element={<UnifiedLobby />} />
            <Route path="/play/:code" element={<PlayRoute />} />
            <Route path="/results/:code" element={<GameResults />} />

            {/* ── Arena ─────────────────────────────────────────── */}
            <Route path="/arena" element={<ArenaLobby />} />

            {/* ── Library ────────────────────────────────────────── */}
            <Route
              path="/library"
              element={
                <Library
                  onBack={() => navigate("/")}
                  onOpenGenerator={() => navigate("/ai")}
                />
              }
            />

            {/* ── AI Generator ───────────────────────────────────── */}
            <Route
              path="/ai"
              element={
                <AIGeneratorView onBack={() => navigate("/library")} />
              }
            />

            {/* ── Admin ──────────────────────────────────────────── */}
            <Route
              path="/admin"
              element={
                adminState === "loading" ? (
                  <div className="min-h-screen flex items-center justify-center bg-clay-cream">
                    <div className="w-10 h-10 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" />
                  </div>
                ) : adminState === "yes" ? (
                  <AdminDashboard onBack={() => navigate("/")} />
                ) : (
                  <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-8 text-center gap-4">
                    <h1 className="text-2xl font-outfit font-black text-plum">
                      Access Denied
                    </h1>
                    <p className="text-plum/40">
                      You do not have permission to access the admin dashboard.
                    </p>
                    <button
                      onClick={() => navigate("/")}
                      className="px-6 py-3 rounded-2xl bg-soft-purple text-white font-bold"
                    >
                      Return Home
                    </button>
                  </div>
                )
              }
            />

            {/* ── Local Play ─────────────────────────────────────── */}
            <Route
              path="/local"
              element={
                localSettings ? (
                  <GameBoardV2
                    lobbyCode="LOCAL"
                    settings={localSettings}
                    isLocal={true}
                    initialCategories={localSettings.round_categories}
                    onExit={() => navigate("/")}
                  />
                ) : (
                  <LocalPlaySetupV2
                    onStart={(settings: any) => {
                      store.setLocalGameSettings(settings);
                      setLocalSettings(settings);
                      navigate("/local");
                    }}
                  />
                )
              }
            />

            {/* ── Buzzer ────────────────────────────────────────── */}
            <Route path="/buzzer/:code" element={<BuzzerPlayerView />} />

            {/* ── Prototype (dev only) ───────────────────────────── */}
            <Route path="/prototype" element={<ClayPrototype />} />
            <Route path="/prototype-links" element={<LinksBoardPrototype />} />
          </Routes>
        </div>
      </ToastProvider>
    </ThemeProvider>
  );
}
