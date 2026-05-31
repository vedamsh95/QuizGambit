import React from 'react';
import ClayCard from './ClayCard';

const DEMO_ACTIVITIES = [
  { id: 1, text: "Player 2 played FAST (+40)", type: "score", dot: "bg-soft-purple", textCol: "text-plum/80" },
  { id: 2, text: "Player 3 lost a life!", type: "damage", dot: "bg-peach", textCol: "text-peach" },
  { id: 3, text: "Player 4 was poisoned", type: "poison", dot: "bg-plum", textCol: "text-plum/80" },
  { id: 4, text: "Player 2 is on a streak!", type: "streak", dot: "bg-amber-400", textCol: "text-amber-500" },
  { id: 5, text: "Player 2 is typing...", type: "typing", dot: "bg-mint animate-pulse", textCol: "text-plum/40 italic" }
];

export default function ActivityFeed() {
  return (
    <div className="flex flex-col h-full">
      <ClayCard elevation="flat" padding="sm" className="flex flex-col gap-3 min-h-[300px] overflow-y-auto scrollbar-hide border border-black/5">
        {DEMO_ACTIVITIES.map(act => (
          <div key={act.id} className={`text-sm font-black flex items-center gap-2.5 ${act.textCol}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${act.dot}`}></span>
            <span>{act.text}</span>
          </div>
        ))}
        <div className="text-xs text-center font-bold opacity-30 mt-2">Waiting for actions...</div>
      </ClayCard>
    </div>
  );
}
