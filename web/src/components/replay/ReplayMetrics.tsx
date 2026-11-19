import { useEffect, useState } from "react";

import { MetricTile } from "../console/MetricTile";

import { pointMetrics, type Track } from "../../lib/replay";
import { formatPlayTime } from "../../lib/format";

import type { Playback } from "../../lib/playback";
import type { TrackPoint } from "../../lib/api/client";

interface Props {
  playback: Playback;
  track: Track;
  points: TrackPoint[];
  start: number;
  routeDistance: number;
}

interface View {
  index: number;
  isGap: boolean;
}

const viewAt = (track: Track, t: number): View => ({
  index: track.indexAt(t),
  isGap: track.at(t, false) === null,
});

export const ReplayMetrics = ({
  playback,
  track,
  points,
  start,
  routeDistance,
}: Props) => {
  const [view, setView] = useState(() =>
    viewAt(track, start + playback.get().elapsed),
  );

  useEffect(() => {
    const sync = (elapsed: number) => {
      const next = viewAt(track, start + elapsed);
      setView((prev) =>
        prev.index === next.index && prev.isGap === next.isGap ? prev : next,
      );
    };
    sync(playback.get().elapsed);

    return playback.subscribe((s) => sync(s.elapsed));
  }, [playback, track, start]);

  const index = Math.max(view.index, 0);
  const point = points[index];
  if (!point) return null;
  const at = formatPlayTime(track.times[index] - start);

  return (
    <section
      aria-label="Telemetry at the cursor"
      className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card"
    >
      <p className="min-h-4 text-xs text-warning tabular-nums">
        {view.isGap &&
          (view.index < 0
            ? `No data until ${at}`
            : `No data, showing record at ${at}`)}
      </p>
      <dl
        className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${view.isGap ? "opacity-50" : ""}`}
      >
        {pointMetrics(point, routeDistance).map((m) => (
          <MetricTile key={m.label} metric={m} isAnimated={false} />
        ))}
      </dl>
    </section>
  );
};
