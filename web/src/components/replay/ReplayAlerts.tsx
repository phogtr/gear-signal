import { SeverityLabel } from "../console/Severity";
import { formatPlayTime } from "../../lib/format";

import type { Playback } from "../../lib/playback";
import type { ReplayAlert } from "../../lib/replay";

interface Props {
  playback: Playback;
  alerts: ReplayAlert[];
}

export const ReplayAlerts = ({ playback, alerts }: Props) => {
  if (alerts.length === 0) return null;

  return (
    <section
      aria-label="Trip alerts"
      className="p-3 rounded-lg border border-border bg-card"
    >
      <ul className="flex flex-col gap-1">
        {alerts.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => playback.seek(a.at)}
              className="flex w-full items-center gap-3 px-2 py-1.5 rounded-md text-left text-sm hover:bg-muted/50"
            >
              <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {formatPlayTime(a.at)}
              </span>{" "}
              <span className="w-20 shrink-0 text-xs">
                <SeverityLabel severity={a.severity} />
              </span>{" "}
              <span className="min-w-0">{a.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
