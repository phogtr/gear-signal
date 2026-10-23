import type { TripSource } from "../../lib/api/client";

const options: { value: TripSource | undefined; label: string }[] = [
  { value: undefined, label: "All trips" },
  { value: "planned", label: "Planned only" },
];

interface Props {
  value: TripSource | undefined;
  onChange: (value: TripSource | undefined) => void;
}

export const SourceFilter = ({ value, onChange }: Props) => {
  return (
    <div
      role="group"
      aria-label="Show in Active and Recent"
      className="flex gap-1"
    >
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1 rounded-full border text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
            value === o.value
              ? "bg-secondary text-secondary-foreground shadow-xs"
              : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};
