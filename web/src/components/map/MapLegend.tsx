import type { Vehicle } from "../../lib/api/client";

type Status = Vehicle["status"];

const items: { status: Status; label: string; dot: string }[] = [
  { status: "en_route", label: "En route", dot: "bg-primary" },
  { status: "idle", label: "Idle", dot: "bg-muted" },
  { status: "charging", label: "Charging", dot: "bg-success" },
  { status: "maintenance", label: "Maintenance", dot: "bg-accent" },
];

export const MapLegend = ({ vehicles }: { vehicles: Vehicle[] }) => {
  return (
    <section
      aria-label="Map legend"
      className="px-3 py-2 text-xs rounded-sm border border-border bg-surface"
    >
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.status} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`size-2.5 rounded-full ${item.dot}`}
            />
            <span className="flex-1">{item.label}</span>
            <span className="text-muted tabular-nums">
              {vehicles.filter((v) => v.status === item.status).length}
            </span>
          </li>
        ))}

        <li className="pt-1 flex items-center gap-2 border-t border-border">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full border-2 border-accent"
          />
          <span className="flex-1">Depot</span>
        </li>
      </ul>
    </section>
  );
};
