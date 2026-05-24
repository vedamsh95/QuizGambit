import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "./lib/supabase";
import { store } from "./lib/storage";
import GameBoard from "./components/GameBoard";
import GameRoom from "./components/GameRoom";
import Library from "./components/Library";
import AdminDashboard from "./components/AdminDashboard";
import HostDashboard from "./components/HostDashboard";
import HostLobby from "./components/HostLobby";
import PlayerView from "./components/PlayerView";
import ArenaLobby from "./components/ArenaLobby";
import ArenaBoard from "./components/ArenaBoard";
import AIGeneratorView from "./components/AIGeneratorView";
import Home from "./components/Home";

// PlayerRoute: wraps PlayerView/ArenaBoard, handles URL params for /play?code=&mode=
function PlayerRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || "";
  const mode = searchParams.get("mode");
  const storedName = store.getPlayerName();

  // Shared ID Logic
  const [playerId] = useState(() => store.ensurePlayerId());

  // Heartbeat: lighter cadence to reduce DB write load under multiplayer concurrency
  useEffect(() => {
    if (!playerId || !code) return;

    const beat = async () => {
      await supabase
        .from("players")
        .update({ last_seen: new Date().toISOString() })
        .eq("id", playerId);
    };

    // Initial beat
    beat();

    const interval = setInterval(beat, 10000);
    return () => clearInterval(interval);
  }, [playerId, code]);

  // If no code, show a clear recovery path.
  if (!code)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-10 text-center gap-4">
        <h1 className="text-3xl font-orbitron font-black">Invalid Game Code</h1>
        <p className="text-white/40">
          Please return home and enter a valid Arena or game code.
        </p>
        <button
          onClick={() => navigate("/")}
          className="px-6 py-3 rounded-xl bg-neon-emerald text-black font-black uppercase tracking-widest"
        >
          Return Home
        </button>
      </div>
    );

  if (mode === "arena") {
    return (
      <ArenaBoard code={code} playerId={playerId} playerName={storedName} />
    );
  }

  return <PlayerView code={code} name={storedName} />;
}

export default function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [adminState, setAdminState] = useState<'loading' | 'yes' | 'no'>('loading');
  const [localSettings, setLocalSettings] = useState<any>(() => store.getLocalGameSettings());

  useEffect(() => {
    // Auth Subscription
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      checkAdmin(session?.user?.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      checkAdmin(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = async (userId: string | undefined) => {
    if (!userId) {
      setAdminState('no');
      return;
    }
    try {
      const { data } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", userId)
        .single();
      setAdminState(data?.is_admin ? 'yes' : 'no');
    } catch (err) {
      console.error("Failed to check admin status:", err);
      setAdminState('no'); // Fail closed
    }
  };

  // Handlers
  const handleHost = () => navigate("/host");
  const handleJoin = (code: string, name: string) => {
    store.setPlayerName(name);
    navigate(`/play/${code}`);
  };
  const handleStartLocal = (settings: any) => {
    store.setLocalGameSettings(settings);
    setLocalSettings(settings);
    navigate("/local");
  };
  const handleCreateArena = () => navigate("/arena");

  return (
    <div className="min-h-screen bg-deep-void">
      <Routes>
        <Route
          path="/"
          element={
            <Home
              isAdmin={adminState === 'yes'}
              onHost={handleHost}
              onCreateArena={handleCreateArena}
              onJoin={handleJoin}
              onStartLocal={handleStartLocal}
              onLibrary={() => navigate("/library")}
              onAdmin={() => navigate("/admin")}
            />
          }
        />

        <Route path="/host" element={<HostDashboard />} />
        <Route path="/host/:code" element={<HostLobby />} />
        <Route path="/arena" element={<ArenaLobby />} />
        <Route path="/play" element={<PlayerRoute />} />
        <Route path="/play/:code" element={<GameRoom />} />

        <Route
          path="/library"
          element={
            <Library
              onBack={() => navigate("/")}
              onOpenGenerator={() => navigate("/ai")}
            />
          }
        />

        <Route
          path="/ai"
          element={<AIGeneratorView onBack={() => navigate("/library")} />}
        />

        <Route
          path="/admin"
          element={
            adminState === 'loading' ? (
              <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-neon-emerald"></div>
              </div>
            ) : adminState === 'yes' ? (
              <AdminDashboard onBack={() => navigate("/")} />
            ) : (
              <div className="min-h-screen flex flex-col items-center justify-center text-white p-10 text-center gap-4">
                <h1 className="text-3xl font-orbitron font-black">
                  Access Denied
                </h1>
                <p className="text-white/40">
                  You do not have permission to open the admin dashboard.
                </p>
                <button
                  onClick={() => navigate("/")}
                  className="px-6 py-3 rounded-xl bg-neon-emerald text-black font-black uppercase tracking-widest"
                >
                  Return Home
                </button>
              </div>
            )
          }
        />

        <Route
          path="/local"
          element={
            localSettings ? (
              <GameBoard
                lobbyCode="LOCAL"
                settings={localSettings}
                isLocal={true}
                initialCategories={localSettings.round_categories}
                onExit={() => navigate("/")}
              />
            ) : (
              <div className="text-white text-center mt-20">
                No active local game.{" "}
                <button
                  onClick={() => navigate("/")}
                  className="underline text-neon-emerald"
                >
                  Return Home
                </button>
              </div>
            )
          }
        />
      </Routes>

      {/* Admin Quick Link moved to Home */}
    </div>
  );
}
