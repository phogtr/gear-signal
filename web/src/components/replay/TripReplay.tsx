import { useEffect, useMemo, useState } from "react";

import { ReplayCharts } from "./ReplayCharts";
import { ReplayControls } from "./ReplayControls";
import { ReplayLegend } from "./ReplayLegend";
import { ReplayMap } from "./ReplayMap";
import { ReplayMetrics } from "./ReplayMetrics";

import { makePlayback } from "../../lib/playback";
import { makeTrack, summarizeTrack, tripCharts } from "../../lib/replay";
import { makePolyline } from "../../lib/map/polyline";

import type { Depot, Route, TripTrack } from "../../lib/api/client";

interface Props {
  track: TripTrack;
  route: Route | undefined;
  depots: Depot[];
}

export const TripReplay = ({ track, route, depots }: Props) => {
  const [playback] = useState(() => makePlayback());

  useEffect(() => () => playback.dispose(), [playback]);

  const summary = useMemo(() => summarizeTrack(track), [track]);
  const model = useMemo(
    () => makeTrack(track.points, route && makePolyline(route.coordinates)),
    [track.points, route],
  );
  const gaps = useMemo(
    () =>
      summary.gaps.map((g) => ({
        from: g.from - summary.start,
        to: g.to - summary.start,
      })),
    [summary],
  );
  const duration = summary.end - summary.start;
  const routeDistance = route?.distance ?? 0;
  const charts = useMemo(
    () => tripCharts(track.points, summary.start, routeDistance),
    [track.points, summary.start, routeDistance],
  );

  useEffect(() => {
    playback.reset(duration);
  }, [playback, track.trip.id, duration]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex flex-col gap-2">
        <div className="relative h-64 overflow-hidden rounded-lg border border-border sm:h-96">
          <ReplayMap
            tripId={track.trip.id}
            route={route}
            depots={depots}
            points={track.points}
            track={model}
            playback={playback}
            start={summary.start}
          />
        </div>
        <div className="sm:absolute sm:bottom-3 sm:left-3">
          <ReplayLegend />
        </div>
      </div>

      {summary.state === "ready" && (
        <>
          <ReplayControls playback={playback} gaps={gaps} />
          <ReplayMetrics
            playback={playback}
            track={model}
            points={track.points}
            start={summary.start}
            routeDistance={routeDistance}
          />
          <ReplayCharts
            playback={playback}
            charts={charts}
            duration={duration}
          />
        </>
      )}
    </div>
  );
};
