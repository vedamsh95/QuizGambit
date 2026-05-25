import clsx from "clsx";

type AvatarSize = "sm" | "md" | "lg";
type Status = "online" | "offline" | "away" | "none";

export interface ClayAvatarProps {
  name?: string;
  color?: string;
  size?: AvatarSize;
  status?: Status;
  className?: string;
}

const sizeStyles: Record<AvatarSize, { container: string; font: string }> = {
  sm: { container: "w-8 h-8 rounded-xl", font: "text-xs" },
  md: { container: "w-11 h-11 rounded-2xl", font: "text-base" },
  lg: { container: "w-14 h-14 rounded-2xl", font: "text-xl" },
};

const statusColors: Record<Status, string> = {
  online: "bg-mint",
  offline: "bg-warm-gray",
  away: "bg-butter",
  none: "",
};

const statusSizes: Record<AvatarSize, string> = {
  sm: "w-2 h-2 ring-1",
  md: "w-2.5 h-2.5 ring-1",
  lg: "w-3 h-3 ring-2",
};

export default function ClayAvatar({
  name = "?",
  color = "bg-soft-purple",
  size = "md",
  status = "none",
  className,
}: ClayAvatarProps) {
  const s = sizeStyles[size];
  const showStatus = status !== "none";
  const initial = name?.charAt(0).toUpperCase() || "?";

  return (
    <div className="relative inline-flex">
      <div
        className={clsx(
          "clay-avatar",
          color,
          s.container,
          s.font,
          className,
        )}
      >
        {initial}
      </div>
      {showStatus && (
        <span
          className={clsx(
            "absolute bottom-0 right-0 rounded-full ring-white",
            statusColors[status],
            statusSizes[size],
          )}
        />
      )}
    </div>
  );
}
