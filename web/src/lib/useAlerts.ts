import { useMemo } from "react";

import { useEvents } from "./api/queries";
import { useSocketStore } from "./ws/socket";
import { activeAlerts, mergeEvents } from "./events";

// REST history + live events
export const useAlerts = () => {
  const history = useEvents();
  const live = useSocketStore((s) => s.events);

  const events = useMemo(
    () => mergeEvents(history.data ?? [], live),
    [history.data, live],
  );

  const alertByTripId = useMemo(() => activeAlerts(events), [events]);

  return { events, alertByTripId, history };
};
