import { useEffect, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { SeverityLabel } from "./Severity";

import { useSocketStore } from "../../lib/ws/socket";
import { makeHistory } from "../../lib/history";
import {
  chartSummary,
  decimals,
  metrics,
  type Metric,
  type Threshold,
} from "../../lib/console";
import { themeColor } from "../../lib/theme";

import type { AlertSeverity } from "../../lib/events";
import type { VehicleState } from "../../lib/ws/types";

const WINDOW_S = 60;
const HEIGHT = 120;
const CAPACITY = WINDOW_S + 5;
const FONT = `${10 * uPlot.pxRatio}px "Fira Code Variable", monospace`;

interface Props {
  vehicleId: number;
  data: Metric[];
  alerts: Map<string, AlertSeverity>; // by metric label
  startedAt?: string;
}

export const TelemetryCharts = ({
  vehicleId,
  data,
  alerts,
  startedAt,
}: Props) => {
  const plots = useRef<(HTMLDivElement | null)[]>([]);
  const hoverCaption = useRef<(HTMLSpanElement | null)[]>([]);
  const departure = useRef<number | null>(null);
  const charts = useRef<uPlot[]>([]);

  useEffect(() => {
    if (!startedAt) return;

    departure.current = Date.parse(startedAt) / 1000;
    charts.current.forEach((u) => u.redraw());
  }, [startedAt]);

  const key = data.map((m) => m.label).join("|");

  useEffect(() => {
    const labels = key.split("|");
    const store = useSocketStore.getState();

    const done = store.completed[vehicleId];
    const live = store.vehicles.find((v) => v.vehicleId === vehicleId);
    const first = live ?? done?.state;
    if (!first) return;

    const specs = labels.map((l) =>
      metrics(first, 0).find((m) => m.label === l)!,
    );
    const colors = {
      line: themeColor("info"),
      axis: themeColor("muted-foreground"),
      grid: themeColor("border"),
      warning: themeColor("warning"),
      critical: themeColor("danger"),
    };

    const history = makeHistory(CAPACITY, labels.length);
    let tripId = first.tripId;
    let frame = 0;
    let firstX: number | null = null;
    let newestX: number | null = null;
    const origin = () => departure.current ?? firstX ?? 0;

    charts.current = specs.map((spec, i) => {
      const el = plots.current[i]!;
      const gauge = spec.gauge!;
      const digits = decimals(spec.value);

      const elapsed = (x: number) => Math.round(x - origin());

      return new uPlot(
        {
          width: el.clientWidth || 300,
          height: HEIGHT,
          padding: [8, 16, 0, 0],
          legend: { show: false },
          cursor: { y: false, points: { show: false }, drag: { x: false } },
          scales: {
            x: {
              time: false,
              // 0 to 60 s, then slides with newest point
              range: () => {
                const end = Math.max(newestX ?? 0, origin() + WINDOW_S);
                return [end - WINDOW_S, end];
              },
            },
            y: { range: [gauge.min, gauge.max] },
          },
          axes: [
            {
              stroke: colors.axis,
              font: FONT,
              grid: { stroke: colors.grid, width: 1 },
              ticks: { show: false },
              size: 20, // default 50px leaves a blank under the label
              // every 15s since departure: 0, 15, 30, 45 ...
              splits: (_u, _i, min, max) => {
                const o = origin();
                const out = [];
                for (
                  let s = Math.ceil((min - o) / 15) * 15;
                  o + s <= max;
                  s += 15
                ) {
                  out.push(o + s);
                }
                return out;
              },
              values: (_u, splits) => splits.map((x) => String(elapsed(x))),
            },
            {
              stroke: colors.axis,
              font: FONT,
              size: 36,
              grid: { stroke: colors.grid, width: 1 },
              ticks: { show: false },
              // 0, 50, 100
              splits: (_u, _i, min, max) => {
                const out = [];
                for (let v = Math.ceil(min / 50) * 50; v <= max; v += 50) {
                  out.push(v);
                }
                return out;
              },
            },
          ],
          series: [
            {},
            { stroke: colors.line, width: 2, points: { show: false } },
          ],
          hooks: {
            draw: gauge.threshold
              ? [
                  drawThreshold(
                    gauge.threshold,
                    colors[gauge.threshold.severity],
                    colors.axis,
                  ),
                ]
              : [],
            // hover: e.g. "45 s: 68 km/h"
            setCursor: [
              (u) => {
                const idx = u.cursor.idx;
                const y = idx == null ? undefined : u.data[1][idx];
                hoverCaption.current[i]!.textContent =
                  idx == null || y == null
                    ? ""
                    : `${elapsed(u.data[0][idx])} s: ${y.toFixed(digits)} ${spec.unit}`;
              },
            ],
          },
        },
        [[], []],
        el,
      );
    });

    const draw = () => {
      frame = 0;
      const data = history.data();
      charts.current.forEach((u, i) => {
        u.setData([data[0], data[i + 1]]);

        const spec = specs[i];
        plots.current[i]!.setAttribute(
          "aria-label",
          chartSummary(
            spec.label,
            spec.unit,
            decimals(spec.value),
            WINDOW_S,
            data[i + 1],
          ),
        );
      });
    };

    const push = (state: VehicleState, ts: string) => {
      if (state.tripId !== tripId) {
        history.clear();
        tripId = state.tripId;
        firstX = null;
        newestX = null;
        departure.current = null;
      }

      const x = Date.parse(ts) / 1000;
      firstX ??= x;
      newestX = Math.max(newestX ?? x, x);
      const ms = metrics(state, 0);
      const values = labels.map(
        (l) => ms.find((m) => m.label === l)?.gauge?.value ?? NaN,
      );
      if (history.push(x, values) && !frame) {
        frame = requestAnimationFrame(draw);
      }
    };

    if (live && store.ts) push(live, store.ts);
    else if (done) push(done.state, done.at);

    const unsubscribe = useSocketStore.subscribe((s, prev) => {
      if (!s.ts || s.ts === prev.ts) return;

      const now = s.vehicles.find((v) => v.vehicleId === vehicleId);
      const finished = s.completed[vehicleId];
      const state = now ?? (finished?.at === s.ts ? finished.state : undefined);
      if (state) push(state, s.ts);
    });

    const resize = new ResizeObserver(() =>
      charts.current.forEach((u, i) =>
        u.setSize({ width: plots.current[i]!.clientWidth, height: HEIGHT }),
      ),
    );
    plots.current.forEach((el) => el && resize.observe(el));

    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
      resize.disconnect();
      charts.current.forEach((u) => u.destroy());
      charts.current = [];
    };
  }, [vehicleId, key]);

  return (
    <section aria-labelledby="trends-heading" className="mt-4">
      <div className="mt-2 grid gap-2">
        {data.map((m, i) => {
          const severity = alerts.get(m.label);
          return (
            <figure
              key={m.label}
              className="min-w-0 p-3 rounded-md border border-border"
            >
              <figcaption className="flex items-center justify-between gap-2 text-xs">
                <span>
                  <span className="font-semibold">{m.label}</span>{" "}
                  <span className="text-muted-foreground">{m.unit}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    ref={(el) => {
                      hoverCaption.current[i] = el;
                    }}
                    className="font-mono text-muted-foreground tabular-nums"
                  />
                  {severity && (
                    <SeverityLabel severity={severity} isText={false} />
                  )}
                </span>
              </figcaption>

              <div
                ref={(el) => {
                  plots.current[i] = el;
                }}
                role="img"
                aria-label={`${m.label}: waiting for data`}
                className="mt-1"
              />
            </figure>
          );
        })}
      </div>
    </section>
  );
};

const drawThreshold =
  (t: Threshold, color: string, textColor: string) => (u: uPlot) => {
    const px = uPlot.pxRatio;
    const y = Math.round(u.valToPos(t.value, "y", true)) + 0.5;
    const { left, width } = u.bbox;
    const ctx = u.ctx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = px;
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = FONT;
    ctx.textAlign = "right";
    ctx.textBaseline = t.when === "above" ? "bottom" : "top";
    ctx.fillText(
      `alert ${t.when === "above" ? ">" : "<"} ${t.value}`,
      left + width - 4 * px,
      y + (t.when === "above" ? -3 : 3) * px,
    );
    ctx.restore();
  };
