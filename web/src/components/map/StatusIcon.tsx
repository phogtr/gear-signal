import { cssColor } from "../../lib/theme";
import { VEHICLE_STATUSES } from "../../constants/map";

import type { Vehicle } from "../../lib/api/client";

export const StatusIcon = ({ status }: { status: Vehicle["status"] }) => {
  const color = cssColor(
    VEHICLE_STATUSES.find((s) => s.status === status)!.color,
  );

  if (status === "en_route") {
    return (
      <svg
        aria-hidden="true"
        viewBox="0 0 10 10"
        className="size-2.5 shrink-0 fill-none"
        style={{ stroke: color }}
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <path d="M5 1 L8.5 9 L1.5 9 Z" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`size-2.5 shrink-0 rounded-full ${status === "idle" ? "opacity-60" : ""}`}
      style={{ backgroundColor: color }}
    />
  );
};
