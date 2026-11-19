import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { CHART_FONT, drawThreshold, ySplits } from "../../lib/chart";
import { timeStep, tripChartSummary, type TripCharts } from "../../lib/replay";
import { formatPlayTime } from "../../lib/format";
import { cssColor, themeColor } from "../../lib/theme";
import type { Playback } from "../../lib/playback";

const HEIGHT = 120;

interface Props {
  playback: Playback;
  charts: TripCharts;
  duration: number; // ms
}

export const ReplayCharts = ({ playback, charts, duration }: Props) => {
  const plots = useRef<(HTMLDivElement | null)[]>([]);
  const captions = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const end = duration / 1000;
    const step = timeStep(end);
    const colors = {
      line: themeColor("info"),
      axis: themeColor("muted-foreground"),
      grid: themeColor("border"),
      warning: themeColor("warning"),
      critical: themeColor("danger"),
    };
    const cursors: HTMLDivElement[] = [];

    const us = charts.series.map((s, i) => {
      const el = plots.current[i]!;
      const threshold = s.gauge.threshold;

      const u = new uPlot(
        {
          width: el.clientWidth || 300,
          height: HEIGHT,
          padding: [8, 16, 0, 0],
          legend: { show: false },
          cursor: {
            y: false,
            points: { show: false },
            drag: { x: false, y: false },
          },
          scales: {
            x: { time: false, range: [0, end] },
            y: { range: [s.gauge.min, s.gauge.max] },
          },
          axes: [
            {
              stroke: colors.axis,
              font: CHART_FONT,
              grid: { stroke: colors.grid, width: 1 },
              ticks: { show: false },
              size: 20,
              splits: (_u, _i, min, max) => {
                const out = [];
                for (
                  let v = Math.ceil(min / step) * step;
                  v <= max;
                  v += step
                ) {
                  out.push(v);
                }
                return out;
              },
              values: (_u, splits) =>
                splits.map((v) => formatPlayTime(v * 1000)),
            },
            {
              stroke: colors.axis,
              font: CHART_FONT,
              size: 36,
              grid: { stroke: colors.grid, width: 1 },
              ticks: { show: false },
              splits: ySplits,
            },
          ],
          series: [
            {},
            { stroke: colors.line, width: 2, points: { show: false } },
          ],
          hooks: {
            draw: threshold
              ? [
                  drawThreshold(
                    threshold,
                    colors[threshold.severity],
                    colors.axis,
                  ),
                ]
              : [],
            // hover: "0:45: 68 km/h"
            setCursor: [
              (u) => {
                const caption = captions.current[i];
                if (!caption) return;
                const idx = u.cursor.idx;
                const y = idx == null ? null : u.data[1][idx];
                caption.textContent =
                  idx == null || y == null
                    ? ""
                    : `${formatPlayTime(u.data[0][idx] * 1000)}: ${y.toFixed(s.digits)} ${s.unit}`;
              },
            ],
          },
        },
        [charts.x, s.values],
        el,
      );

      const line = document.createElement("div");
      line.setAttribute("aria-hidden", "true");
      Object.assign(line.style, {
        position: "absolute",
        top: "0",
        bottom: "0",
        left: "-1px",
        width: "2px",
        background: cssColor("foreground"),
        pointerEvents: "none",
      });
      u.over.appendChild(line);
      u.over.style.cursor = "pointer";
      u.over.addEventListener("click", (e) =>
        playback.seek(u.posToVal(e.offsetX, "x") * 1000),
      );
      cursors.push(line);
      return u;
    });

    const move = (elapsed: number) =>
      us.forEach((u, i) => {
        cursors[i].style.transform =
          `translateX(${u.valToPos(elapsed / 1000, "x")}px)`;
      });
    move(playback.get().elapsed);
    const unsubscribe = playback.subscribe((s) => move(s.elapsed));

    const resize = new ResizeObserver(() => {
      us.forEach((u, i) => {
        const el = plots.current[i];
        if (el) u.setSize({ width: el.clientWidth, height: HEIGHT });
      });
      move(playback.get().elapsed);
    });
    plots.current.forEach((el) => el && resize.observe(el));

    return () => {
      unsubscribe();
      resize.disconnect();
      us.forEach((u) => u.destroy());
    };
  }, [charts, duration, playback]);

  return (
    <section aria-label="Trip charts" className="grid gap-2">
      {charts.series.map((s, i) => (
        <figure
          key={s.label}
          className="min-w-0 p-3 rounded-lg border border-border bg-card"
        >
          <figcaption className="flex items-center justify-between gap-2 text-xs">
            <span>
              <span className="font-semibold">{s.label}</span>{" "}
              <span className="text-muted-foreground">{s.unit}</span>
            </span>
            <span
              aria-hidden="true"
              ref={(el) => {
                captions.current[i] = el;
              }}
              className="font-mono text-muted-foreground tabular-nums"
            />
          </figcaption>
          <div
            ref={(el) => {
              plots.current[i] = el;
            }}
            role="img"
            aria-label={tripChartSummary(s)}
            className="mt-1"
          />
        </figure>
      ))}
    </section>
  );
};
