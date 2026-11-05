import type { ReactNode } from "react";

import { CircleCheckIcon } from "../../icons/CircleCheckIcon";
import { InfoIcon } from "../../icons/InfoIcon";
import { SquareExclamationIcon } from "../../icons/SquareExclamationIcon";

import type { EventRecord } from "../../lib/api/client";

const SEVERITY: Record<
  EventRecord["severity"],
  { label: string; icon: ReactNode; className: string }
> = {
  critical: {
    label: "Critical",
    icon: <SquareExclamationIcon />,
    className: "text-danger",
  },
  warning: {
    label: "Warning",
    icon: <InfoIcon />,
    className: "text-warning",
  },
  info: {
    label: "Cleared",
    icon: <CircleCheckIcon />,
    className: "text-muted-foreground",
  },
};

export const SeverityLabel = ({
  severity,
  isText = true,
}: {
  severity: EventRecord["severity"];
  isText?: boolean;
}) => {
  const s = SEVERITY[severity];
  return (
    <span
      className={`flex shrink-0 items-center gap-1 font-semibold ${s.className}`}
    >
      <span aria-hidden="true" className="flex [&>svg]:size-3.5">
        {s.icon}
      </span>

      {isText ? s.label : <span className="sr-only">{s.label}</span>}
    </span>
  );
};
