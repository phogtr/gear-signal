import type { UseQueryResult } from "@tanstack/react-query";

import { useDepots, useRoutes, useVehicles } from "../../../lib/api/queries";

// Temporary: proves the data layer end to end
export const MapPage = () => {
  const depots = useDepots();
  const routes = useRoutes();
  const vehicles = useVehicles();

  return (
    <section className="p-6">
      <h1 className="text-lg font-semibold">Data</h1>

      <dl className="mt-4 grid max-w-md grid-cols-3 gap-3">
        <Stat label="Depots" query={depots} />
        <Stat label="Routes" query={routes} />
        <Stat label="Vehicles" query={vehicles} />
      </dl>
    </section>
  );
};

const Stat = ({
  label,
  query,
}: {
  label: string;
  query: UseQueryResult<unknown[]>;
}) => {
  let value: string;
  if (query.isPending) value = "…";
  else if (query.isError) value = "error";
  else value = String(query.data.length);

  return (
    <div className="rounded bg-surface p-3">
      <dt className="text-xs text-muted uppercase">{label}</dt>
      <dd
        className={`mt-1 text-2xl font-semibold tabular-nums ${query.isError ? "text-danger" : ""}`}
        title={query.isError ? query.error.message : undefined}
      >
        {value}
      </dd>
    </div>
  );
};
