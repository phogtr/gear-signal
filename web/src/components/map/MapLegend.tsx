import { StatusIcon } from "./StatusIcon";

import { cssColor } from "../../lib/theme";
import { VEHICLE_STATUSES, WARNING_COLOR } from "../../constants/map";

import type { Vehicle } from "../../lib/api/client";

export const MapLegend = ({ vehicles }: { vehicles: Vehicle[] }) => {
  return (
    <section
      aria-label="Map legend"
      className="px-3 py-2 text-xs rounded-lg border border-border bg-card"
    >
      <ul className="space-y-1">
        {VEHICLE_STATUSES.map((item) => (
          <li key={item.status} className="flex items-center gap-2">
            <StatusIcon status={item.status} />
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
