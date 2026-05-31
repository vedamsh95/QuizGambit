import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { store } from "../../lib/storage";
import { ArrowLeft, Play, Sparkles } from "lucide-react";
import ClayButton from "../ui/ClayButton";

export default function SoloLinksSetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [letterCount, setLetterCount] = useState(3);
  const [waveTimer, setWaveTimer] = useState(60);
  const [targetMode, setTargetMode] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = useCallback(() => {
    setIsStarting(true);
    const settings = {
      letterCount,
      waveTimer,
      targetMode,
    };
    store.setLocalGameSettings(settings);
    navigate("/solo/links/play");
  }, [letterCount, waveTimer, targetMode, navigate]);

  return (
    <div className="min-h-screen bg-clay-cream flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 py-4 flex items-center gap-3 border-b border-warm-gray/10 bg-warm-white/80 backdrop-blur-sm">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs font-bold text-peach hover:text-peach/80 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">{t("common.back")}</span>
        </button>
        <span className="font-outfit font-black text-lg text-plum">
          🔗 {t("solo.linksTitle")}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center p-4 sm:p-6 gap-6 overflow-y-auto">
        {/* Title section */}
        <div className="text-center space-y-2 max-w-md">
          <h1 className="font-outfit font-black text-3xl text-plum">
            {t("solo.linksTitle")}
          </h1>
          <p className="text-sm text-warm-gray/60">
            {t("solo.linksDesc")}
          </p>
        </div>

        {/* Settings */}
        <div className="w-full max-w-md space-y-4">
          {/* Letter count */}
          <div className="clay p-5 space-y-3">
            <div>
              <h3 className="font-outfit font-bold text-sm text-plum">
                {t("solo.lettersCount")}
              </h3>
              <p className="text-[10px] text-warm-gray/50 mt-0.5">
                {t("solo.lettersCountDesc")}
              </p>
            </div>
            <div className="flex gap-1">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setLetterCount(n)}
                  className={`flex-1 h-12 rounded-xl font-outfit font-black text-lg transition-all ${
                    letterCount === n
                      ? "bg-soft-purple text-white shadow-lg shadow-soft-purple/20"
                      : "bg-cream text-plum/40 hover:text-plum border border-clay-border/50"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Wave timer */}
          <div className="clay p-5 space-y-3">
            <div>
              <h3 className="font-outfit font-bold text-sm text-plum">
                {t("solo.waveTimer")}
              </h3>
              <p className="text-[10px] text-warm-gray/50 mt-0.5">
                {t("solo.waveTimerDesc")}
              </p>
            </div>
            <input
              type="range"
              min={30}
              max={120}
              step={15}
              value={waveTimer}
              onChange={(e) => setWaveTimer(Number(e.target.value))}
              className="w-full accent-soft-purple"
            />
            <div className="flex justify-between text-xs font-bold">
              <span className="text-warm-gray/40">30s</span>
              <span className="font-outfit font-black text-soft-purple">{waveTimer}s</span>
              <span className="text-warm-gray/40">120s</span>
            </div>
            {/* Wave preview */}
            <div className="flex gap-2 mt-2">
              {[1, 2, 3].map((wave) => {
                const waveTime = Math.floor(waveTimer * (1 - (wave - 1) * 0.25));
                return (
                  <div key={wave} className="flex-1 text-center">
                    <span className="text-[10px] font-black text-warm-gray/40 uppercase">
                      {t("solo.wave")} {wave}
                    </span>
                    <div className="text-xs font-mono font-bold text-plum/60">
                      {waveTime}s
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Target mode toggle */}
          <div className="clay p-4 flex items-center justify-between">
            <div>
              <h3 className="font-outfit font-bold text-sm text-plum flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-butter" />
                {t("solo.targetMode")}
              </h3>
              <p className="text-[10px] text-warm-gray/50 mt-0.5">
                {t("solo.targetModeDesc")}
              </p>
            </div>
            <button
              onClick={() => setTargetMode(!targetMode)}
              className={`relative w-14 h-8 rounded-full transition-all ${
                targetMode ? "bg-butter" : "bg-warm-gray/30"
              }`}
            >
              <span
                className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all ${
                  targetMode ? "left-7" : "left-1"
                }`}
              />
            </button>
          </div>
        </div>

        {/* Start button */}
        <div className="w-full max-w-md">
          <ClayButton
            variant="primary"
            size="lg"
            loading={isStarting}
            icon={<Play className="w-5 h-5" />}
            onClick={handleStart}
            className="w-full bg-soft-purple hover:bg-soft-purple/90"
          >
            {t("solo.startSprint")}
          </ClayButton>
        </div>
      </div>
    </div>
  );
}
