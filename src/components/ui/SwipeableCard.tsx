import { type ReactNode, useRef, useState } from "react";
import clsx from "clsx";

export interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Minimum swipe distance in px to trigger action */
  threshold?: number;
  className?: string;
}

export default function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  threshold = 80,
  className,
}: SwipeableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    startXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientX - startXRef.current;
    setOffsetX(delta);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (offsetX > threshold && onSwipeRight) {
      onSwipeRight();
    } else if (offsetX < -threshold && onSwipeLeft) {
      onSwipeLeft();
    }
    setOffsetX(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const delta = e.clientX - startXRef.current;
    setOffsetX(delta);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (offsetX > threshold && onSwipeRight) {
      onSwipeRight();
    } else if (offsetX < -threshold && onSwipeLeft) {
      onSwipeLeft();
    }
    setOffsetX(0);
  };

  return (
    <div
      ref={cardRef}
      className={clsx(
        "relative touch-pan-y select-none transition-transform",
        isDragging && "transition-none",
        className,
      )}
      style={{
        transform: `translateX(${offsetX}px) rotate(${offsetX * 0.03}deg)`,
        opacity: isDragging ? 1 - Math.abs(offsetX) / 400 : 1,
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {children}

      {/* Swipe hints */}
      {isDragging && (
        <>
          {onSwipeRight && offsetX > 30 && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-mint text-2xl animate-pulse">
              →
            </div>
          )}
          {onSwipeLeft && offsetX < -30 && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-peach text-2xl animate-pulse">
              ←
            </div>
          )}
        </>
      )}
    </div>
  );
}
