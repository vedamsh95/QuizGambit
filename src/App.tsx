import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "./lib/supabase";
// import LocalPlaySetup from './LocalPlaySetup' // Import removed as file is missing
import GameBoard from "./components/GameBoard";
import Library from "./components/Library";
import AdminDashboard from "./components/AdminDashboard";
import HostDashboard from "./components/HostDashboard";
import PlayerView from "./components/PlayerView";
import ArenaLobby from "./components/ArenaLobby";
import ArenaBoard from "./components/ArenaBoard";
import AIGeneratorView from "./components/AIGeneratorView";
import Home from "./components/Home";

// Wrapper for PlayerView to handle URL params
// Wrapper for PlayerView to handle URL params
function PlayerRoute() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = searchParams.get("code") || "";
  const mode = searchParams.get("mode");
  const storedName = localStorage.getItem("qb_player_name") || "";

  // Shared ID Logic
  const [playerId] = useState(() => {
    const saved = localStorage.getItem("qb_pid");
    if (saved) return saved;
    const newId = crypto.randomUUID();
    localStorage.setItem("qb_pid", newId);
    return newId;
  });

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [localSettings, setLocalSettings] = useState<any>(null);

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
      setIsAdmin(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .single();
    setIsAdmin(data?.is_admin || false);
  };

  // Handlers
  const handleHost = () => navigate("/host");
  const handleJoin = (code: string, name: string) => {
    localStorage.setItem("qb_player_name", name);
    navigate(`/play?code=${code}`);
  };
  const handleStartLocal = (settings: any) => {
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
              isAdmin={isAdmin}
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
        <Route path="/arena" element={<ArenaLobby />} />
        <Route path="/play" element={<PlayerRoute />} />

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
            isAdmin ? (
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
