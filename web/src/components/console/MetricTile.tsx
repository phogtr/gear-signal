import { useId } from "react";

import { SeverityLabel } from "./Severity";

import {
  gaugeFraction,
  gaugeText,
  type Gauge,
  type Metric,
} from "../../lib/console";
import type { AlertSeverity } from "../../lib/events";

const SEVERITY_CLASS = {
  warning: "bg-warning/35",
  critical: "bg-danger/35",
} as const;

interface Props {
  metric: Metric;
  severity?: AlertSeverity;
  isAnimated?: boolean;
}

export const MetricTile = ({ metric, severity, isAnimated = true }: Props) => {
  const labelId = useId();

  const { gauge } = metric;
  // one decimal, aria-valuenow must stay within min..max
  const now =
    gauge &&
    Math.round(Math.min(Math.max(gauge.value, gauge.min), gauge.max) * 10) / 10;

  const value = (
    <span className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="font-mono text-2xl whitespace-nowrap tabular-nums sm:text-3xl">
        {metric.value}
      </span>
      <span className="text-xs text-muted-foreground">{metric.unit}</span>
    </span>
  );

  return (
    <div className="flex flex-col gap-1 p-3 rounded-md border border-border">
      <dt id={labelId} className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {metric.label}
        </span>
        {/* Speed Warning, not SpeedWarning */}
        {severity && " "}
        {severity && (
          <span className="text-[11px]">
            <SeverityLabel severity={severity} isText={false} />
          </span>
        )}
      </dt>
      <dd>
        {gauge ? (
          <div
            role="meter"
            aria-labelledby={labelId}
            aria-valuemin={gauge.min}
            aria-valuemax={gauge.max}
            aria-valuenow={now}
            aria-valuetext={gaugeText(metric)}
          >
            <div aria-hidden="true">
              {value}
              <GaugeBar gauge={gauge} isAnimated={isAnimated} />
            </div>
          </div>
        ) : (
          value
        )}
      </dd>
    </div>
  );
};

const GaugeBar = ({
  gauge,
  isAnimated,
}: {
  gauge: Gauge;
  isAnimated: boolean;
}) => {
  const fill = gaugeFraction(gauge.value, gauge.min, gauge.max);
  const threshold = gauge.threshold;
  const at =
    threshold && gaugeFraction(threshold.value, gauge.min, gauge.max) * 100;

  return (
    <div className="mt-2">
      <div className="relative">
        <div className="relative h-2 overflow-hidden rounded-xs bg-muted">
          {threshold && at !== undefined && (
            <div
              className={`absolute inset-y-0 ${SEVERITY_CLASS[threshold.severity]}`}
              style={
                threshold.when === "above"
                  ? { left: `${at}%`, right: 0 }
                  : { left: 0, width: `${at}%` }
              }
            />
          )}
          {/* scaleX instead of width, 1s glide between ticks */}
          <div
            className={`absolute inset-0 origin-left bg-info ${
              isAnimated
                ? "transition-transform duration-1000 ease-linear motion-reduce:transition-none"
                : ""
            }`}
            style={{ transform: `scaleX(${fill})` }}
          />
        </div>
        {at !== undefined && (
          <div
            className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 bg-foreground"
            style={{ left: `${at}%` }}
          />
        )}
      </div>

      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{gauge.min}</span>
        {threshold && (
          <span>
            alert {threshold.when === "above" ? ">" : "<"} {threshold.value}
          </span>
        )}
        <span>{gauge.max}</span>
      </div>
    </div>
  );
};
