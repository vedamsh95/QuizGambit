import { type HTMLAttributes, type ReactNode } from "react";
import clsx from "clsx";

type Elevation = "flat" | "elevated" | "pressed";
type Padding = "sm" | "md" | "lg" | "none";

export interface ClayCardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  padding?: Padding;
  hover?: boolean;
  children?: ReactNode;
}

const elevationClass: Record<Elevation, string> = {
  flat: "clay",
  elevated: "clay-elevated",
  pressed: "clay-pressed",
};

const paddingClass: Record<Padding, string> = {
  sm: "p-3",
  md: "p-5",
  lg: "p-8",
  none: "p-0",
};

export default function ClayCard({
  elevation = "flat",
  padding = "md",
  hover = false,
  children,
  className,
  ...props
}: ClayCardProps) {
  return (
    <div
      className={clsx(
        elevationClass[elevation],
        paddingClass[padding],
        hover && "transition-transform hover:-translate-y-1",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
