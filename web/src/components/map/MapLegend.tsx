import {
  INFO_COLOR,
  MUTED_FOREGROUND_COLOR,
  SUCCESS_COLOR,
  WARNING_COLOR,
} from "../../constants/map";

import type { Vehicle } from "../../lib/api/client";

type Status = Vehicle["status"];

// Tailwind doesn't work with `bg-${token}`
// tokens are applied through CSS variables instead
const cssColor = (token: string) => `var(--color-${token})`;

const items: { status: Status; label: string; color: string }[] = [
  { status: "en_route", label: "En route", color: INFO_COLOR },
  { status: "idle", label: "Idle", color: MUTED_FOREGROUND_COLOR },
  { status: "charging", label: "Charging", color: SUCCESS_COLOR },
  { status: "maintenance", label: "Maintenance", color: WARNING_COLOR },
];

export const MapLegend = ({ vehicles }: { vehicles: Vehicle[] }) => {
  return (
    <section
      aria-label="Map legend"
      className="px-3 py-2 text-xs rounded-sm border border-border bg-card"
    >
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.status} className="flex items-center gap-2">
            {item.status === "en_route" ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 10 10"
                className="size-2.5 fill-none"
                style={{ stroke: cssColor(item.color) }}
                strokeWidth="1.5"
                strokeLinejoin="round"
              >
                <path d="M5 1 L8.5 9 L1.5 9 Z" />
              </svg>
            ) : (
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${item.status === "idle" ? "opacity-60" : ""}`}
                style={{ backgroundColor: cssColor(item.color) }}
              />
            )}
            <span className="flex-1">{item.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {vehicles.filter((v) => v.status === item.status).length}
            </span>
          </li>
        ))}

        <li className="pt-1 flex items-center gap-2 border-t border-border">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full border-2"
            style={{ borderColor: cssColor(WARNING_COLOR) }}
          />
          <span className="flex-1">Depot</span>
        </li>
      </ul>
    </section>
  );
};
