import { useState } from "react";
import { Search, Sparkles, Play, ArrowRight, Users, Clock } from "lucide-react";
import {
  ClayButton,
  ClayCard,
  ClayInput,
  ClayBadge,
  ClayAvatar,
  ClayBuzzer,
  ClayTile,
  ClayToggle,
  ToastProvider,
  useToast,
  BottomSheet,
  SwipeableCard,
  LanguageSwitcher,
  ThemeProvider,
  ThemeSwitcher,
  useTheme,
} from "./ui";

// ── Constants ────────────────────────────────────────────────────────────

const GRID_COLORS = ["purple", "sky", "peach", "mint", "butter"] as const;

// ── Toast Demo Inner Component ────────────────────────────────────────────

function ToastDemo() {
  const { addToast } = useToast();

  return (
    <div className="flex flex-wrap gap-2">
      <ClayButton variant="success" size="sm" onClick={() => addToast("success", "Game saved successfully!")}>
        Success Toast
      </ClayButton>
      <ClayButton variant="destructive" size="sm" onClick={() => addToast("error", "Failed to join lobby. Try again.")}>
        Error Toast
      </ClayButton>
      <ClayButton variant="secondary" size="sm" onClick={() => addToast("warning", "Your connection is slow.")}>
        Warning Toast
      </ClayButton>
      <ClayButton variant="primary" size="sm" onClick={() => addToast("info", "Alice joined the lobby!")}>
        Info Toast
      </ClayButton>
    </div>
  );
}

// ── BottomSheet Demo ──────────────────────────────────────────────────────

function BottomSheetDemo() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ClayButton variant="primary" onClick={() => setOpen(true)}>
        Open Bottom Sheet
      </ClayButton>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Game Settings" height={60}>
        <div className="space-y-4">
          <ClayInput label="Timer (seconds)" defaultValue="15" />
          <ClayInput label="Rounds" defaultValue="5" />
          <ClayToggle checked={true} onChange={() => {}} label="Buzzer Mode" />
          <ClayToggle checked={false} onChange={() => {}} label="Mystery Mode" />
          <div className="flex gap-3 pt-2">
            <ClayButton variant="ghost" onClick={() => setOpen(false)} className="flex-1">Cancel</ClayButton>
            <ClayButton variant="primary" onClick={() => setOpen(false)} className="flex-1">Apply</ClayButton>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

// ── SwipeableCard Demo ────────────────────────────────────────────────────

function SwipeableCardDemo() {
  const [feedback, setFeedback] = useState("");

  return (
    <div className="space-y-2">
      <SwipeableCard
        onSwipeLeft={() => setFeedback("← Swiped left — rejected!")}
        onSwipeRight={() => setFeedback("→ Swiped right — accepted!")}
      >
        <ClayCard elevation="elevated" padding="md" className="text-center">
          <p className="font-outfit font-extrabold text-lg text-plum mb-1">Swipe Me!</p>
          <p className="text-warm-gray text-sm">← Dismiss · Accept →</p>
        </ClayCard>
      </SwipeableCard>
      {feedback && (
        <ClayBadge color={feedback.includes("accepted") ? "mint" : "peach"}>
          {feedback}
        </ClayBadge>
      )}
    </div>
  );
}

// ── Main Prototype ────────────────────────────────────────────────────────

function PrototypeInner() {
  const { theme } = useTheme();
  const [buzzerState, setBuzzerState] = useState<"locked" | "open" | "buzzed">("open");
  const [mysteryToggle, setMysteryToggle] = useState(false);
  const [inputError, setInputError] = useState("");

  return (
    <div className="min-h-screen bg-clay-cream pb-20">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="sticky top-0 z-50 bg-cream/80 backdrop-blur-xl border-b border-clay-border">
          <div className="max-w-5xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-soft-purple flex items-center justify-center text-white font-outfit font-black text-lg">
                Q
              </div>
              <span className="font-outfit font-black text-lg md:text-xl text-plum tracking-tight">
                QuizGambit <span className="text-soft-purple">v2</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ThemeSwitcher compact />
              <LanguageSwitcher compact />
              <ClayBadge color={theme === "dark" ? "purple" : theme === "multi" ? "mint" : "purple"}>
                ✨ {theme === "dark" ? "Dark" : theme === "multi" ? "Candy" : "Light"}
              </ClayBadge>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-4 md:px-6 space-y-16 py-8 md:py-12">

          {/* ── SECTION 1: ClayButton ────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🔘 ClayButton
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              5 variants × 3 sizes × loading + disabled states. Bouncy press feedback.
            </p>

            <ClayCard elevation="elevated" padding="lg">
              {/* Variants */}
              <div className="mb-6">
                <p className="font-outfit font-bold text-sm text-warm-gray mb-3">Variants (all md size)</p>
                <div className="flex flex-wrap gap-3">
                  <ClayButton variant="primary" icon={<Sparkles className="w-4 h-4" />}>Primary CTA</ClayButton>
                  <ClayButton variant="secondary">Secondary</ClayButton>
                  <ClayButton variant="success" icon={<Play className="w-4 h-4" />}>Success</ClayButton>
                  <ClayButton variant="destructive">Destructive</ClayButton>
                  <ClayButton variant="ghost">Ghost</ClayButton>
                </div>
              </div>

              {/* Sizes */}
              <div className="mb-6 pt-6 border-t border-clay-border">
                <p className="font-outfit font-bold text-sm text-warm-gray mb-3">Sizes</p>
                <div className="flex flex-wrap items-end gap-3">
                  <ClayButton variant="primary" size="sm">Small</ClayButton>
                  <ClayButton variant="primary" size="md">Medium</ClayButton>
                  <ClayButton variant="primary" size="lg">Large</ClayButton>
                </div>
              </div>

              {/* States */}
              <div className="pt-6 border-t border-clay-border">
                <p className="font-outfit font-bold text-sm text-warm-gray mb-3">States</p>
                <div className="flex flex-wrap gap-3">
                  <ClayButton variant="primary" loading>Loading</ClayButton>
                  <ClayButton variant="secondary" disabled>Disabled</ClayButton>
                  <ClayButton variant="primary" icon={<ArrowRight className="w-4 h-4" />}>With Icon</ClayButton>
                </div>
              </div>
            </ClayCard>
          </section>

          {/* ── SECTION 2: ClayCard ──────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🃏 ClayCard
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              3 elevations. Pure CSS box-shadow claymorphism.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ClayCard elevation="flat" padding="md" className="text-center space-y-2">
                <ClayBadge color="purple">Flat</ClayBadge>
                <div className="text-3xl">📦</div>
                <p className="font-outfit font-bold text-plum">Standard Card</p>
                <p className="text-warm-gray text-xs">6px shadow, subtle inner highlight</p>
              </ClayCard>

              <ClayCard elevation="elevated" padding="md" className="text-center space-y-2">
                <ClayBadge color="mint">Elevated</ClayBadge>
                <div className="text-3xl">✨</div>
                <p className="font-outfit font-bold text-plum">Elevated Card</p>
                <p className="text-warm-gray text-xs">10px shadow, deeper highlight</p>
              </ClayCard>

              <ClayCard elevation="pressed" padding="md" className="text-center space-y-2">
                <ClayBadge color="peach">Pressed</ClayBadge>
                <div className="text-3xl">👆</div>
                <p className="font-outfit font-bold text-plum">Pressed Card</p>
                <p className="text-warm-gray text-xs">Sunk-in appearance, inner shadow</p>
              </ClayCard>
            </div>

            {/* Padding demo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
              {(["sm", "md", "lg", "none"] as const).map((p) => (
                <ClayCard key={p} elevation="flat" padding={p} className="text-center">
                  <ClayBadge color="gray">padding={p}</ClayBadge>
                  {p !== "none" && <p className="text-warm-gray text-xs mt-1">Some content</p>}
                </ClayCard>
              ))}
            </div>
          </section>

          {/* ── SECTION 3: ClayInput ─────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              ⌨️ ClayInput
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              Inset shadows. Purple focus ring. Label + error + icon support.
            </p>

            <ClayCard elevation="elevated" padding="lg">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ClayInput
                  label="Player Name"
                  placeholder="Enter your name"
                  icon={<Users className="w-4 h-4" />}
                />
                <ClayInput
                  label="Game Code"
                  placeholder="ABCD"
                  mono
                  maxLength={4}
                  icon={<Search className="w-4 h-4" />}
                />
                <ClayInput
                  label="Email (with error)"
                  placeholder="you@example.com"
                  error={inputError}
                  onChange={(e) => setInputError(e.target.value ? "" : "Email is required")}
                />
                <div>
                  <p className="font-outfit font-bold text-sm text-warm-gray mb-3">Trigger error</p>
                  <ClayButton variant="destructive" size="sm" onClick={() => setInputError("Email is required")}>
                    Show Error
                  </ClayButton>
                </div>
              </div>
            </ClayCard>
          </section>

          {/* ── SECTION 4: ClayBadge ─────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🏷️ ClayBadge
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              6 colors + optional dot indicator.
            </p>

            <ClayCard elevation="flat" padding="lg">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(["purple", "mint", "peach", "sky", "butter", "gray"] as const).map((c) => (
                    <ClayBadge key={c} color={c}>
                      {c}
                    </ClayBadge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <ClayBadge color="purple" dot>⚡ Your Turn</ClayBadge>
                  <ClayBadge color="mint" dot>🎯 Correct</ClayBadge>
                  <ClayBadge color="peach" dot>❌ Wrong</ClayBadge>
                  <ClayBadge color="butter" dot>⏳ Waiting</ClayBadge>
                  <ClayBadge color="sky" dot>🔒 Locked</ClayBadge>
                  <ClayBadge color="gray" dot>📚 45 Qs</ClayBadge>
                </div>
              </div>
            </ClayCard>
          </section>

          {/* ── SECTION 5: ClayAvatar ────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              👤 ClayAvatar
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              3 sizes + online/offline/away status dots.
            </p>

            <ClayCard elevation="flat" padding="lg">
              <div className="flex flex-wrap items-end gap-6">
                {/* Sizes */}
                <div className="flex items-end gap-3">
                  <ClayAvatar name="Alice" size="sm" color="bg-soft-purple" status="online" />
                  <ClayAvatar name="Bob" size="md" color="bg-sky" status="online" />
                  <ClayAvatar name="Carol" size="lg" color="bg-peach" status="online" />
                </div>
                {/* Statuses */}
                <div className="flex items-end gap-3">
                  <ClayAvatar name="Dave" size="md" color="bg-mint" status="online" />
                  <ClayAvatar name="Eve" size="md" color="bg-butter" status="away" />
                  <ClayAvatar name="Frank" size="md" color="bg-warm-gray" status="offline" />
                </div>
              </div>
              <p className="text-warm-gray text-xs mt-4">
                sm/md/lg sizes · online (green) / away (yellow) / offline (gray) status dots
              </p>
            </ClayCard>
          </section>

          {/* ── SECTION 6: ClayBuzzer ────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              ⚡ ClayBuzzer
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              Locked / Open (pulsing) / Buzzed. sm + lg sizes.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ClayCard elevation="flat" padding="md" className="flex flex-col items-center gap-3">
                <ClayBadge color="gray">🔒 LOCKED</ClayBadge>
                <ClayBuzzer state="locked" size="sm" />
                <p className="text-warm-gray text-xs text-center">Host hasn't opened buzzers</p>
              </ClayCard>

              <ClayCard elevation="elevated" padding="md" className="flex flex-col items-center gap-3">
                <ClayBadge color="purple" dot>⚡ BUZZ NOW</ClayBadge>
                <ClayBuzzer
                  state={buzzerState === "buzzed" ? "buzzed" : "open"}
                  size="lg"
                  onClick={() => setBuzzerState("buzzed")}
                />
                <div className="flex gap-2 mt-2">
                  <ClayButton variant="secondary" size="sm" onClick={() => setBuzzerState("open")}>Reset to Open</ClayButton>
                  <ClayButton variant="ghost" size="sm" onClick={() => setBuzzerState("locked")}>Lock</ClayButton>
                </div>
              </ClayCard>

              <ClayCard elevation="flat" padding="md" className="flex flex-col items-center gap-3">
                <ClayBadge color="mint" dot>✅ YOUR TURN</ClayBadge>
                <ClayBuzzer state="buzzed" size="sm" />
                <p className="text-mint text-xs text-center font-medium">You buzzed first!</p>
              </ClayCard>
            </div>
          </section>

          {/* ── SECTION 7: ClayTile ──────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🎯 ClayTile
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              3 states × 5 colors. Game board question grid.
            </p>

            <ClayCard elevation="elevated" padding="md" className="overflow-x-auto">
              <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(5, minmax(72px, 1fr))" }}>
                {/* Headers */}
                {["📚 Lit", "🔬 Science", "🎬 Movies", "🎵 Music", "🌍 Geo"].map((cat) => (
                  <ClayCard key={cat} elevation="flat" padding="sm" className="text-center">
                    <span className="font-outfit font-extrabold text-[10px] md:text-xs text-plum">{cat}</span>
                  </ClayCard>
                ))}
                {/* Grid rows */}
                {[0, 1, 2, 3].map((row) =>
                [0, 1, 2, 3, 4].map((col) => {
                  const points = [100, 200, 300, 400][row];
                  const isRevealed = row === 3 && col > 2;

                  return (
                    <ClayTile
                      key={`${row}-${col}`}
                      state={isRevealed ? "revealed" : "unrevealed"}
                      color={GRID_COLORS[col]}
                      points={points}
                      answer={isRevealed ? "Paris" : undefined}
                    />
                  );
                })
                )}
              </div>
              <p className="text-center text-warm-gray text-xs mt-3">
                Unrevealed = colored badge. Revealed = sunk + answer. Click tiles to test.
              </p>
            </ClayCard>
          </section>

          {/* ── SECTION 8: ClayToggle ────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🔄 ClayToggle
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              Spring-animated switch with label. role=&quot;switch&quot; + aria-checked.
            </p>

            <ClayCard elevation="flat" padding="lg">
              <div className="space-y-4">
                <ClayToggle checked={true} onChange={() => {}} label="Buzzer Mode (ON)" />
                <ClayToggle
                  checked={mysteryToggle}
                  onChange={setMysteryToggle}
                  label={`Mystery Mode (${mysteryToggle ? "ON" : "OFF"})`}
                />
                <ClayToggle checked={false} onChange={() => {}} label="Speed Bonus" disabled />
              </div>
            </ClayCard>
          </section>

          {/* ── SECTION 9: ClayToast ─────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🔔 ClayToast
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              4 types (success/error/warning/info). Auto-dismiss in 3.5s. Top-right stack.
            </p>

            <ClayCard elevation="flat" padding="lg">
              <ToastDemo />
              <p className="text-warm-gray text-xs mt-3">Click buttons to trigger toasts ↑</p>
            </ClayCard>
          </section>

          {/* ── SECTION 10: Mobile Components ────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              📱 Mobile Components
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              BottomSheet + SwipeableCard. Touch-optimized, safe-area aware.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* BottomSheet */}
              <ClayCard elevation="elevated" padding="lg" className="flex flex-col items-center gap-4 text-center">
                <div className="text-4xl">📋</div>
                <div>
                  <p className="font-outfit font-extrabold text-lg text-plum">BottomSheet</p>
                  <p className="text-warm-gray text-sm">Swipe down to dismiss. Focus trapped. Safe-area padded.</p>
                </div>
                <BottomSheetDemo />
              </ClayCard>

              {/* SwipeableCard */}
              <ClayCard elevation="elevated" padding="lg" className="flex flex-col items-center gap-4 text-center">
                <div className="text-4xl">👆</div>
                <div>
                  <p className="font-outfit font-extrabold text-lg text-plum">SwipeableCard</p>
                  <p className="text-warm-gray text-sm">Swipe left/right with 3D rotation. 80px threshold.</p>
                </div>
                <SwipeableCardDemo />
              </ClayCard>
            </div>
          </section>

          {/* ── SECTION 11: Theming ──────────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🎨 Theme Switcher
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              Live theme switching with CSS variables. No FOUC, no page reload.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ClayCard elevation={theme === "light" ? "elevated" : "flat"} padding="md" className="text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-white text-amber-500 flex items-center justify-center text-xl shadow-sm">☀️</div>
                <p className="font-outfit font-extrabold text-plum">Light</p>
                <p className="text-warm-gray text-xs">Cream bg · White surfaces · Warm clay shadows</p>
              </ClayCard>

              <ClayCard elevation={theme === "dark" ? "elevated" : "flat"} padding="md" className="text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-gray-800 text-indigo-300 flex items-center justify-center text-xl shadow-sm">🌙</div>
                <p className="font-outfit font-extrabold text-plum">Dark</p>
                <p className="text-warm-gray text-xs">Void bg · Plum surfaces · Pure black shadows</p>
              </ClayCard>

              <ClayCard elevation={theme === "multi" ? "elevated" : "flat"} padding="md" className="text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-pink-400 via-purple-400 to-cyan-400 text-white flex items-center justify-center text-xl shadow-sm">🌈</div>
                <p className="font-outfit font-extrabold text-plum">Candy Pop</p>
                <p className="text-warm-gray text-xs">White surfaces · Purple/pink shadows · Max saturation accents</p>
              </ClayCard>
            </div>

            <ClayCard elevation="flat" padding="md" className="mt-4">
              <div className="space-y-3">
                <p className="font-outfit font-bold text-sm text-warm-gray">Switch theme (compact — header bar)</p>
                <ThemeSwitcher compact />
                <div className="pt-3 border-t border-clay-border">
                  <p className="font-outfit font-bold text-sm text-warm-gray mb-2">Switch theme (full — settings panel)</p>
                  <div className="max-w-xs">
                    <ThemeSwitcher />
                  </div>
                </div>
              </div>
            </ClayCard>
          </section>

          {/* ── SECTION 12: Language Switcher ────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🌐 Language Switcher
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              Compact flag chips (header) + full list (settings panel). 🇬🇧 🇩🇪 🇪🇸 🇫🇷 🇷🇺
            </p>

            <ClayCard elevation="elevated" padding="lg">
              <div className="space-y-4">
                <div>
                  <p className="font-outfit font-bold text-sm text-warm-gray mb-2">Compact (header bar)</p>
                  <LanguageSwitcher compact />
                </div>
                <div className="pt-4 border-t border-clay-border">
                  <p className="font-outfit font-bold text-sm text-warm-gray mb-2">Full (settings panel)</p>
                  <div className="max-w-xs">
                    <LanguageSwitcher />
                  </div>
                </div>
              </div>
            </ClayCard>
          </section>

          {/* ── SECTION 13: Home Screen Preview ──────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🏠 Home Screen (Bento Grid)
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              All components combined in a realistic layout.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-min">
              {/* Join Card — spans 2 cols */}
              <ClayCard elevation="elevated" padding="md" className="md:col-span-2 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🎮</span>
                  <h3 className="font-outfit font-extrabold text-lg md:text-xl text-plum">Join Game</h3>
                </div>
                <div className="flex gap-3 flex-wrap">
                  <ClayInput mono placeholder="CODE" maxLength={4} className="w-28" />
                  <ClayInput placeholder="Your name" className="flex-1 min-w-32" />
                  <ClayButton variant="primary" icon={<ArrowRight className="w-4 h-4" />}>Join</ClayButton>
                </div>
              </ClayCard>

              {/* Stats Card */}
              <ClayCard elevation="flat" padding="md" className="flex flex-col items-center text-center space-y-3">
                <ClayAvatar name="You" size="lg" color="bg-soft-purple" status="online" />
                <div>
                  <p className="font-outfit font-bold text-plum">Your Stats</p>
                  <p className="text-warm-gray text-xs">12 games · 67% wins</p>
                </div>
              </ClayCard>

              {/* Host Standard */}
              <ClayCard elevation="flat" padding="md" className="space-y-3 hover:-translate-y-1 transition-transform cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-sky-light flex items-center justify-center text-2xl">🎤</div>
                <div>
                  <h3 className="font-outfit font-extrabold text-base md:text-lg text-plum">Host TV Show</h3>
                  <p className="text-warm-gray text-xs md:text-sm">TV-style quiz. You host, players buzz in.</p>
                </div>
              </ClayCard>

              {/* 5x5 Grid */}
              <ClayCard elevation="flat" padding="md" className="space-y-3 hover:-translate-y-1 transition-transform cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-peach-light flex items-center justify-center text-2xl">⚔️</div>
                <div>
                  <h3 className="font-outfit font-extrabold text-base md:text-lg text-plum">5×5 Grid</h3>
                  <p className="text-warm-gray text-xs md:text-sm">Same-screen local play. Everyone buzzes on one device.</p>
                </div>
              </ClayCard>

              {/* Library */}
              <ClayCard elevation="flat" padding="md" className="space-y-3 hover:-translate-y-1 transition-transform cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-butter-light flex items-center justify-center text-2xl">📚</div>
                <div>
                  <h3 className="font-outfit font-extrabold text-base md:text-lg text-plum">Question Library</h3>
                  <p className="text-warm-gray text-xs md:text-sm">Browse & manage question sets.</p>
                </div>
              </ClayCard>
            </div>
          </section>

          {/* ── Section 14: Question Modal Preview ───────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              ❓ Question Modal
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              Clay-style question with MCQ answers and timer.
            </p>

            <ClayCard elevation="elevated" padding="lg">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <ClayBadge color="purple">📖 Literature · 300 PTS</ClayBadge>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-peach" />
                  <span className="font-mono font-bold text-xl md:text-2xl text-peach">0:12</span>
                </div>
              </div>

              <h2 className="font-outfit font-extrabold text-2xl md:text-4xl text-plum text-center leading-tight mb-8">
                What is the capital of France?
              </h2>

              <div className="max-w-sm mx-auto space-y-3">
                {["London", "Paris", "Berlin", "Madrid"].map((ans, i) => (
                  <ClayButton
                    key={ans}
                    variant="secondary"
                    className="w-full justify-start text-left px-6"
                  >
                    {String.fromCharCode(65 + i)}. {ans}
                  </ClayButton>
                ))}
              </div>
            </ClayCard>
          </section>

          {/* ── Section 15: Standings ──────────────────────────────────── */}
          <section>
            <h2 className="font-outfit font-black text-xl md:text-3xl text-plum mb-2">
              🏆 Standings
            </h2>
            <p className="text-warm-gray text-sm md:text-base mb-6 font-medium">
              Clay cards with avatars, medals, and scores.
            </p>

            <ClayCard elevation="flat" padding="lg">
              <div className="space-y-2">
                {[
                  { name: "Alice", score: 450, rank: 1, color: "bg-soft-purple" },
                  { name: "Bob", score: 320, rank: 2, color: "bg-sky" },
                  { name: "Carol", score: 180, rank: 3, color: "bg-mint" },
                  { name: "Dave", score: 90, rank: 4, color: "bg-butter" },
                ].map((p) => (
                  <ClayCard key={p.name} elevation="flat" padding="sm" className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-outfit font-black text-sm text-warm-gray w-6 text-center">
                        {p.rank === 1 ? "🥇" : p.rank === 2 ? "🥈" : p.rank === 3 ? "🥉" : `#${p.rank}`}
                      </span>
                      <ClayAvatar name={p.name} size="sm" color={p.color} status="online" />
                      <span className="font-outfit font-bold text-sm md:text-base text-plum">{p.name}</span>
                    </div>
                    <span className="font-mono font-bold text-base md:text-lg text-soft-purple">{p.score}</span>
                  </ClayCard>
                ))}
              </div>
            </ClayCard>
          </section>

          {/* ── Footer ─────────────────────────────────────────────────── */}
          <div className="text-center pt-8 border-t border-clay-border">
            <p className="text-warm-gray text-sm">
              QuizGambit v2.0 · Clay Pop Design System
            </p>
            <p className="text-warm-gray/60 text-xs mt-1">
              12 clay components · 5 languages · 3 themes · mobile-first · pure CSS
            </p>
          </div>
        </div>
      </div>
  );
}

export default function ClayPrototype() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <PrototypeInner />
      </ToastProvider>
    </ThemeProvider>
  );
}
