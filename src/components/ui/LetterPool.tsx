import React from 'react';
import ClayCard from './ClayCard';

interface LetterPoolProps {
  letters: string[];
  inputText: string;
  title?: string;
  subtitle?: string;
}

export default function LetterPool({ letters, inputText, title = "Letter Pool", subtitle }: LetterPoolProps) {
  return (
    <section>
      <h2 className="text-sm font-bold text-plum/50 uppercase tracking-widest mb-4">{title}</h2>
      <div className="flex flex-wrap gap-4 mb-2">
        {letters.map((letter, i) => {
          const isActive = inputText.toUpperCase().includes(letter);
          return (
            <ClayCard 
              key={i} 
              elevation="elevated" 
              padding="sm"
              className={`w-16 h-16 flex flex-col items-center justify-center transition-all duration-200 ${isActive ? 'bg-soft-purple/10 border-soft-purple/30 ring-2 ring-soft-purple/50 transform scale-110' : 'bg-white'}`}
            >
              <span className={`text-3xl font-black transition-colors ${isActive ? 'text-soft-purple' : 'text-plum'}`}>{letter}</span>
            </ClayCard>
          );
        })}
      </div>
      {subtitle && <div className="text-xs font-bold opacity-60 text-plum ml-1">{subtitle}</div>}
    </section>
  );
}
