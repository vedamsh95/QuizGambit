import React from 'react';

interface TensionTimerProps {
  timeLeft: number;
  maxTime?: number;
  defaultColor?: string;
  sizeClass?: string;
  textClass?: string;
  strokeWidth?: number;
}

export default function TensionTimer({ 
  timeLeft, 
  maxTime = 60, 
  defaultColor = "#A78BFA",
  sizeClass = "w-16 h-16",
  textClass = "text-2xl",
  strokeWidth = 10
}: TensionTimerProps) {
  return (
    <div className={`relative flex items-center justify-center bg-white rounded-full shadow-sm ${sizeClass}`}>
      <svg className="absolute inset-0 w-full h-full -rotate-90 transition-transform" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={strokeWidth} />
        <circle cx="50" cy="50" r="42" fill="none" stroke={timeLeft <= 10 ? "#F87171" : defaultColor} strokeWidth={strokeWidth} strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 42}
          strokeDashoffset={2 * Math.PI * 42 * (1 - timeLeft / maxTime)}
          className="transition-all duration-1000 ease-linear" />
      </svg>
      <div className={`absolute flex flex-col items-center justify-center font-black ${timeLeft <= 10 ? 'text-peach animate-pulse scale-110 drop-shadow-md' : 'text-plum'}`}>
        <span className={`${textClass} leading-none`}>{timeLeft}</span>
      </div>
    </div>
  );
}
