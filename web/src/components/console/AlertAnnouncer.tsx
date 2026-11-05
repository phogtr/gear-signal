import { useEffect, useRef, useState } from "react";

import { useSocketStore } from "../../lib/ws/socket";

import type { Vehicle } from "../../lib/api/client";

// announce only new critical alert
export const AlertAnnouncer = ({ vehicles }: { vehicles: Vehicle[] }) => {
  const [text, setText] = useState("");
  const names = useRef(new Map<number, string>());

  useEffect(() => {
    names.current = new Map(vehicles.map((v) => [v.id, v.name]));
  }, [vehicles]);

  useEffect(() => {
    let lastId = useSocketStore.getState().events[0]?.id ?? 0;

    return useSocketStore.subscribe((s, prev) => {
      if (s.events === prev.events) return;

      const fresh = s.events.filter((e) => e.id > lastId);
      if (fresh.length === 0) return;
      lastId = fresh[0].id;

      const critical = fresh.filter((e) => e.severity === "critical");
      if (critical.length === 0) return;

      setText(
        critical
          .map(
            (e) =>
              `Critical alert, ${names.current.get(e.vehicleId) ?? `vehicle ${e.vehicleId}`}: ${e.message}`,
          )
          .join("; "),
      );
    });
  }, []);

  return (
    <p role="status" className="sr-only">
      {text}
    </p>
  );
};
