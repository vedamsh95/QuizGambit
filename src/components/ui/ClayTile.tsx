import clsx from "clsx";

type TileState = "unrevealed" | "revealed" | "disabled";
export type TileColor = "purple" | "sky" | "peach" | "mint" | "butter";

export interface ClayTileProps {
  state?: TileState;
  color?: TileColor;
  points: number;
  answer?: string;
  onClick?: () => void;
  className?: string;
}

const colorLightMap: Record<TileColor, string> = {
  purple: "bg-lavender",
  sky: "bg-sky",
  peach: "bg-peach",
  mint: "bg-mint",
  butter: "bg-butter",
};

export default function ClayTile({
  state = "unrevealed",
  color = "purple",
  points,
  answer,
  onClick,
  className,
}: ClayTileProps) {
  if (state === "revealed") {
    return (
      <div
        className={clsx(
          "clay-pressed py-4 px-2 flex flex-col items-center justify-center text-center opacity-60",
          className,
        )}
      >
        <span className="text-[10px] text-warm-gray line-through">{points}</span>
        {answer && (
          <span className="text-xs font-outfit font-bold text-plum mt-1">{answer}</span>
        )}
      </div>
    );
  }

  if (state === "disabled") {
    return (
      <div
        className={clsx(
          "clay-pressed py-4 px-2 flex flex-col items-center justify-center text-center opacity-40",
          "cursor-not-allowed",
          className,
        )}
      >
        <span className="text-warm-gray/50 text-sm">—</span>
      </div>
    );
  }

  // Non-clickable unrevealed (e.g. another player is picking) — show numbers but muted
  if (!onClick) {
    return (
      <div
        className={clsx(
          "clay py-4 px-2 flex flex-col items-center justify-center text-center",
          "opacity-60 cursor-default",
          colorLightMap[color],
          className,
        )}
      >
        <span className="font-outfit font-black text-xl md:text-2xl text-plum/60">
          {points}
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={clsx(
        "clay py-4 px-2 flex flex-col items-center justify-center text-center",
        "cursor-pointer transition-transform hover:-translate-y-1 active:scale-95",
        colorLightMap[color],
        className,
      )}
    >
      <span className="font-outfit font-black text-xl md:text-2xl text-plum">
        {points}
      </span>
    </button>
  );
}
