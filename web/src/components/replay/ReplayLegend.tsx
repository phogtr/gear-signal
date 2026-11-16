import { cssColor } from "../../lib/theme";
import { INFO_COLOR, WARNING_COLOR } from "../../constants/map";

export const ReplayLegend = () => {
  return (
    <section
      aria-label="Map legend"
      className="px-3 py-2 text-xs rounded-lg border border-border bg-card"
    >
      <ul className="space-y-1">
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-2 w-4 rounded-full opacity-30"
            style={{ backgroundColor: cssColor(INFO_COLOR) }}
          />
          Planned route
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="flex h-2 w-4 items-center">
            <span
              className="h-0.5 w-full rounded-full"
              style={{ backgroundColor: cssColor(INFO_COLOR) }}
            />
          </span>
          Recorded path
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="flex w-4 justify-center">
            <span
              className="size-2.5 rounded-full border-2"
              style={{ borderColor: cssColor(WARNING_COLOR) }}
            />
          </span>
          Depot
        </li>
      </ul>
    </section>
  );
};
