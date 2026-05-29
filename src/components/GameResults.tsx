import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabase";
import { store } from "../lib/storage";
import ClayButton from "./ui/ClayButton";
import ClayCard from "./ui/ClayCard";
import { Trophy, Medal, Home, RotateCcw } from "lucide-react";
import confetti from "canvas-confetti";
import LanguageSwitcher from "./ui/LanguageSwitcher";

interface PlayerResult {
  id: string;
  name: string;
  score: number;
}

const MEDAL_COLORS = [
  "text-butter",       // 1st - gold
  "text-warm-gray",    // 2nd - silver
  "text-peach",        // 3rd - bronze
];

const BG_GRADIENTS = [
  "linear-gradient(135deg, #FEF3C7, #FDE68A)", // gold
  "linear-gradient(135deg, #F3F4F6, #E5E7EB)", // silver
  "linear-gradient(135deg, #FFE5EB, #FFB3C6)", // bronze
];

export default function GameResults() {
  const { t } = useTranslation();
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    const fetchResults = async () => {
      const { data } = await supabase
        .from("players")
        .select("id, name, score")
        .eq("lobby_code", code)
        .order("score", { ascending: false });

      if (data && data.length > 0) {
        setPlayers(data);
        // Fire confetti for the winner
        confetti({
          particleCount: 150,
          spread: 90,
          origin: { y: 0.4 },
          colors: ["#FBBF24", "#7C5CFC", "#34D399", "#FFFFFF"],
        });
      }
      setLoading(false);
    };
    fetchResults();
  }, [code]);

  const handlePlayAgain = async () => {
    if (!code) return;
    // Reset scores
    await supabase
      .from("players")
      .update({ score: 0 })
      .eq("lobby_code", code);

    // Reset lobby status
    await supabase.from("lobbies").update({ status: "LOBBY" }).eq("code", code);

    navigate(`/lobby/${code}`);
  };

  const handleHome = () => {
    store.clearHostLobbyCode();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-clay-cream flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-soft-purple border-t-transparent animate-spin" />
      </div>
    );
  }

  const top3 = players.slice(0, 3);

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col items-center justify-center p-4 sm:p-8 gap-8">
      {/* Language switcher */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher compact />
      </div>

      {/* Header */}
      <div className="text-center space-y-2 animate-clay-pop">
        <Trophy className="w-12 h-12 text-butter mx-auto" />
        <h1 className="text-3xl sm:text-4xl font-outfit font-black text-plum">
          {t('gameOver.title')}
        </h1>
        <p className="text-sm text-plum/40">{t('gameOver.finalResults')}</p>
      </div>

      {/* Podium */}
      {top3.length > 0 && (
        <div className="flex items-end justify-center gap-3 sm:gap-4 w-full max-w-md animate-clay-pop">
          {/* 2nd place */}
          {top3[1] && (
            <div className="flex flex-col items-center gap-2 flex-1">
              <div
                className="clay-avatar w-16 h-16 sm:w-18 sm:h-18 rounded-full flex items-center justify-center text-white text-xl font-black"
                style={{ background: BG_GRADIENTS[1] }}
              >
                {top3[1].name?.[0]?.toUpperCase()}
              </div>
              <div className="text-center">
                <Medal className="w-5 h-5 text-warm-gray mx-auto mb-1" />
                <p className="text-xs font-bold text-plum truncate max-w-[80px]">
                  {top3[1].name}
                </p>
                <p className="text-lg font-black text-plum font-outfit">
                  {top3[1].score}
                </p>
              </div>
              {/* Bar */}
              <div className="w-full h-20 sm:h-24 clay rounded-t-xl bg-butter-light/30" />
            </div>
          )}

          {/* 1st place */}
          {top3[0] && (
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className="text-butter text-xs font-black uppercase tracking-widest">
                👑 {t('gameOver.winner')}
              </div>
              <div
                className="clay-avatar w-20 h-20 sm:w-22 sm:h-22 rounded-full flex items-center justify-center text-white text-2xl font-black ring-3 ring-butter ring-offset-2"
                style={{ background: BG_GRADIENTS[0] }}
              >
                {top3[0].name?.[0]?.toUpperCase()}
              </div>
              <div className="text-center">
                <p className="text-sm font-black text-plum truncate max-w-[100px]">
                  {top3[0].name}
                </p>
                <p className="text-2xl font-black text-butter font-outfit">
                  {top3[0].score}
                </p>
              </div>
              {/* Bar (tallest) */}
              <div className="w-full h-28 sm:h-32 clay rounded-t-xl bg-butter-light" />
            </div>
          )}

          {/* 3rd place */}
          {top3[2] && (
            <div className="flex flex-col items-center gap-2 flex-1">
              <div
                className="clay-avatar w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center text-white text-lg font-black"
                style={{ background: BG_GRADIENTS[2] }}
              >
                {top3[2].name?.[0]?.toUpperCase()}
              </div>
              <div className="text-center">
                <Medal className="w-5 h-5 text-peach mx-auto mb-1" />
                <p className="text-xs font-bold text-plum truncate max-w-[80px]">
                  {top3[2].name}
                </p>
                <p className="text-lg font-black text-plum font-outfit">
                  {top3[2].score}
                </p>
              </div>
              {/* Bar */}
              <div className="w-full h-16 sm:h-20 clay rounded-t-xl bg-peach-light/30" />
            </div>
          )}
        </div>
      )}

      {/* Full scoreboard */}
      <ClayCard padding="md" className="w-full max-w-sm">
        <h3 className="text-xs font-black uppercase tracking-widest text-plum/40 mb-3">
          {t('gameOver.fullScoreboard')}
        </h3>
        <div className="flex flex-col gap-2">
          {players.map((p, i) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-2 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-xs font-black text-plum/30">
                  {i + 1}
                </span>
                <span className="text-sm font-bold text-plum">{p.name}</span>
              </div>
              <span className="text-sm font-black text-soft-purple font-outfit">
                {p.score} {t('gameOver.score')}
              </span>
            </div>
          ))}
        </div>
      </ClayCard>

      {/* Actions */}
      <div className="flex gap-3 w-full max-w-sm">
        <ClayButton
          variant="secondary"
          size="md"
          icon={<Home className="w-4 h-4" />}
          onClick={handleHome}
          className="flex-1"
        >
          {t('gameOver.home')}
        </ClayButton>
        <ClayButton
          variant="primary"
          size="md"
          icon={<RotateCcw className="w-4 h-4" />}
          onClick={handlePlayAgain}
          className="flex-1"
        >
          {t('gameOver.playAgain')}
        </ClayButton>
      </div>
    </div>
  );
}
