import clsx from "clsx";

export interface ClayToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export default function ClayToggle({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: ClayToggleProps) {
  return (
    <label
      className={clsx(
        "inline-flex items-center gap-3 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={clsx(
          "relative inline-flex items-center rounded-full transition-all duration-300",
          "w-11 h-6",
          checked ? "bg-soft-purple" : "bg-warm-gray/30",
          "clay shadow-[inset_1px_1px_2px_rgba(166,157,145,0.2),inset_-1px_-1px_0px_rgba(255,255,255,0.8)]",
        )}
      >
        <span
          className={clsx(
            "inline-block w-5 h-5 rounded-full bg-white transition-all duration-300",
            "clay shadow-[1px_1px_3px_rgba(166,157,145,0.3)]",
            checked ? "translate-x-[22px]" : "translate-x-[2px]",
          )}
        />
      </button>
      {label && (
        <span className="font-outfit font-bold text-sm text-plum">
          {label}
        </span>
      )}
    </label>
  );
}
