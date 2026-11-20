import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { formatDuration, formatPlayTime } from "../../lib/format";
import {
  PLAYBACK_SPEEDS,
  type Playback,
  type PlaybackSpeed,
  type PlaybackState,
} from "../../lib/playback";
import { gapAt, type Gap, type ReplayAlert } from "../../lib/replay";
import { SeverityLabel } from "../console/Severity";

import { PauseIcon } from "../../icons/PauseIcon";
import { PlayIcon } from "../../icons/PlayIcon";

interface Props {
  playback: Playback;
  gaps: Gap[];
  alerts?: ReplayAlert[];
}

const ARROW_STEP_MS = 5000;

interface View {
  second: number;
  duration: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  gap: Gap | undefined;
}

const toView = (s: PlaybackState, gaps: Gap[]): View => ({
  second: Math.round(s.elapsed / 1000),
  duration: s.duration,
  isPlaying: s.isPlaying,
  speed: s.speed,
  gap: gapAt(gaps, s.elapsed),
});

const isSame = (a: View, b: View) =>
  a.second === b.second &&
  a.duration === b.duration &&
  a.isPlaying === b.isPlaying &&
  a.speed === b.speed &&
  a.gap === b.gap;

export const ReplayControls = ({ playback, gaps, alerts = [] }: Props) => {
  const rangeRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState(() => toView(playback.get(), gaps));

  useEffect(() => {
    const sync = (s: PlaybackState) => {
      if (rangeRef.current) rangeRef.current.value = String(s.elapsed / 1000);
      const next = toView(s, gaps);
      setView((prev) => (isSame(prev, next) ? prev : next));
    };
    sync(playback.get());

    return playback.subscribe(sync);
  }, [playback, gaps]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const { elapsed, duration } = playback.get();
    const page = duration / 10;
    const to: Record<string, number> = {
      ArrowLeft: elapsed - ARROW_STEP_MS,
      ArrowDown: elapsed - ARROW_STEP_MS,
      ArrowRight: elapsed + ARROW_STEP_MS,
      ArrowUp: elapsed + ARROW_STEP_MS,
      PageDown: elapsed - page,
      PageUp: elapsed + page,
      Home: 0,
      End: duration,
    };
    if (e.key === " ") {
      e.preventDefault();
      playback.toggle();
    } else if (e.key in to) {
      e.preventDefault();
      playback.seek(to[e.key]);
    }
  };

  const { duration, isPlaying, speed, gap } = view;
  const elapsedMs = view.second * 1000;

  return (
    <section
      aria-label="Playback"
      className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={playback.toggle}
          disabled={duration <= 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50 [&_svg]:size-4"
        >
          <span aria-hidden="true" className="flex">
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </span>
          {isPlaying ? "Pause" : "Play"}
        </button>

        <span className="font-mono text-sm tabular-nums">
          {formatPlayTime(elapsedMs)}
          <span className="text-muted-foreground">
            {" / "}
            {formatPlayTime(duration)}
          </span>
        </span>

        <div
          role="group"
          aria-label="Playback speed"
          className="ml-auto flex rounded-md border border-border"
        >
          {PLAYBACK_SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={s === speed}
              onClick={() => playback.setSpeed(s)}
              className={`px-2 py-1 text-xs font-mono tabular-nums transition-colors first:rounded-l-md last:rounded-r-md ${
                s === speed
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div>
        <input
          ref={rangeRef}
          type="range"
          aria-label="Trip time"
          aria-valuetext={`${formatDuration(elapsedMs)} of ${formatDuration(duration)}${gap ? ", no data" : ""}`}
          min={0}
          max={duration / 1000}
          step="any"
          defaultValue={0}
          onChange={(e) => playback.seek(Number(e.currentTarget.value) * 1000)}
          onKeyDown={onKeyDown}
          className="block w-full accent-primary"
        />

        <div
          aria-hidden="true"
          className="relative mx-2 mt-1 h-1 rounded-full bg-info/60"
        >
          {duration > 0 &&
            gaps.map((g) => (
              <span
                key={g.from}
                className="absolute inset-y-0 bg-warning"
                style={{
                  left: `${(g.from / duration) * 100}%`,
                  width: `${((g.to - g.from) / duration) * 100}%`,
                }}
              />
            ))}
        </div>

        {duration > 0 && alerts.some((a) => a.severity !== "info") && (
          <div aria-hidden="true" className="relative mx-2 mt-1 h-4 text-xs">
            {alerts
              .filter((a) => a.severity !== "info")
              .map((a) => (
                <span
                  key={a.id}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `${(a.at / duration) * 100}%` }}
                >
                  <SeverityLabel severity={a.severity} isText={false} />
                </span>
              ))}
          </div>
        )}
      </div>

      <p className="min-h-4 text-xs text-warning tabular-nums">
        {gap &&
          `No data from ${formatPlayTime(gap.from)} to ${formatPlayTime(gap.to)}`}
      </p>
    </section>
  );
};
