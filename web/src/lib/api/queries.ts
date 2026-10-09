import { useQuery } from "@tanstack/react-query";

import { api, type Route } from "./client";

// Depots and routes only change when the database is re-seeded, so they never go stale.
export const useDepots = () => {
  return useQuery({
    queryKey: ["depots"],
    queryFn: async () => {
      const { data, response } = await api.GET("/depots");
      return isOk(data, response, "GET /depots");
    },
    staleTime: Infinity,
  });
};

export const useRoutes = () => {
  return useQuery({
    queryKey: ["routes"],
    queryFn: async () => {
      const { data, response } = await api.GET("/routes");
      // openapi-fetch's response helper widens [lng, lat] tuples to number[];
      // the schema type is the accurate one, so restore it.
      return isOk(data as Route[] | undefined, response, "GET /routes");
    },
    staleTime: Infinity,
  });
};

export const useVehicles = () => {
  return useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, response } = await api.GET("/vehicles");
      return isOk(data, response, "GET /vehicles");
    },
  });
};

const isOk = <T>(data: T | undefined, response: Response, label: string): T => {
  if (!response.ok || data === undefined) {
    throw new Error(`${label} failed: HTTP ${response.status}`);
  }
  return data;
};
