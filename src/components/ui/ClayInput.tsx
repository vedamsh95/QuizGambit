import { type InputHTMLAttributes, type ReactNode, useId } from "react";
import clsx from "clsx";

export interface ClayInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  mono?: boolean;
}

export default function ClayInput({
  label,
  error,
  icon,
  mono = false,
  className,
  id,
  ...props
}: ClayInputProps) {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="font-outfit font-bold text-sm text-plum block"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={clsx(
            "clay-input w-full",
            mono && "font-mono font-bold tracking-[0.2em] text-center uppercase",
            icon && "pl-10",
            error && "border-peach/50",
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-peach text-xs font-medium pl-1">
          {error}
        </p>
      )}
    </div>
  );
}
