import React, { useState, useEffect, useRef } from 'react';

interface LetterPoolProps {
  letters: string[];
  inputText: string;
  title?: string;
  subtitle?: string;
  /** Increment to trigger slot-machine reel animation on all tiles. */
  animateKey?: number;
  /** Called when animation starts/ends so parent can pause timers. */
  onAnimationChange?: (animating: boolean) => void;
}

const ALL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const LETTER_H = 3.5; // rem – matches h-14

interface ReelState {
  letters: string[];  // all letters that have scrolled through the reel
  position: number;   // index of the currently visible letter
}

export default function LetterPool({ letters, inputText, title = "Letter Pool", subtitle, animateKey, onAnimationChange }: LetterPoolProps) {
  const [reels, setReels] = useState<ReelState[]>(() =>
    letters.map(l => ({ letters: [l], position: 0 }))
  );
  const [phase, setPhase] = useState<'idle' | 'rapid' | 'slow'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevAnimateKey = useRef<number | undefined>(animateKey);

  // Sync reels when letters change without animation trigger (non-animated updates)
  useEffect(() => {
    if (phase === 'idle' && letters.length > 0) {
      setReels(letters.map(l => ({ letters: [l], position: 0 })));
    }
  }, [letters, phase]);

  useEffect(() => {
    if (letters.length === 0) return;
    // Skip on first render (prevAnimateKey === animateKey)
    if (prevAnimateKey.current === animateKey) return;
    prevAnimateKey.current = animateKey;

    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }

    onAnimationChange?.(true);
    const finalLetters = [...letters];
    setPhase('rapid');

    const rapidMs = 70;
    const rapidCount = 10;   // ~0.7s (halved)
    const slowMs = 160;
    const slowCount = 2;     // ~0.32s (halved) — letters "click" into place
    let tick = 0;

    function roll() {
      tick++;
      if (tick <= rapidCount) {
        // Rapid spin: add random letters to the beginning so they scroll top-to-bottom
        setReels(prev => prev.map(reel => ({
          letters: [ALL_LETTERS[Math.floor(Math.random() * 26)], ...reel.letters],
          position: reel.position + 1,
        })));
        timerRef.current = setTimeout(roll, rapidMs);
      } else if (tick <= rapidCount + slowCount) {
        // Slow-down phase
        if (tick === rapidCount + 1) setPhase('slow');
        setReels(prev => prev.map(reel => ({
          letters: [ALL_LETTERS[Math.floor(Math.random() * 26)], ...reel.letters],
          position: reel.position + 1,
        })));
        timerRef.current = setTimeout(roll, slowMs);
      } else {
        // Final land: add target letters at the beginning, they scroll in with deceleration
        setReels(prev => prev.map((reel, i) => ({
          letters: [finalLetters[i], ...reel.letters],
          position: reel.position + 1,
        })));
        // After the final scroll animation completes, collapse the reel
        // to just the settled letter (no transition = instant snap)
        timerRef.current = setTimeout(() => {
          setReels(finalLetters.map(l => ({ letters: [l], position: 0 })));
          setPhase('idle');
          onAnimationChange?.(false);
          timerRef.current = null;
        }, slowMs + 50);
      }
    }

    roll();

    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [animateKey]);

  const isAnimating = phase !== 'idle';
  const isSlow = phase === 'slow';

  return (
    <section>
      {title && <h2 className="text-sm font-bold text-plum/50 uppercase tracking-widest mb-4">{title}</h2>}
      <div className="flex flex-wrap justify-center gap-3 mb-6">
        {reels.map((reel, i) => {
          const currentLetter = reel.letters[reel.position] || '';
          const isSettled = !isAnimating;
          const isActive = isSettled && inputText.toUpperCase().includes(currentLetter);

          return (
            <div
              key={i}
              className={`w-14 h-14 rounded-2xl overflow-hidden shadow-md border-2 transition-all duration-300 ${
                isActive
                  ? 'bg-soft-purple/10 border-soft-purple/30 ring-2 ring-soft-purple/50 scale-110'
                  : 'bg-white border-white/50'
              }`}
            >
              <div
                className="flex flex-col will-change-transform"
                style={{
                  transform: `translateY(-${reel.position * LETTER_H}rem)`,
                  transition: isAnimating
                    ? (isSlow ? 'transform 0.16s ease-out' : 'transform 0.07s linear')
                    : 'none',
                }}
              >
                {reel.letters.map((l, j) => (
                  <div key={`${j}-${l}`} className="h-14 flex items-center justify-center shrink-0">
                    <span className={`text-3xl font-black select-none ${isActive ? 'text-soft-purple' : 'text-plum'}`}>
                      {l}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {subtitle && <div className="text-xs font-bold opacity-60 text-plum text-center mb-4">{subtitle}</div>}
    </section>
  );
}
