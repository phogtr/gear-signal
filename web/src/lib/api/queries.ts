import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, type NewTrip, type Route, type TripSource } from "./client";

export const RECENT_TRIPS_LIMIT = 20;

// depots & routes only change when database re-seeded, so they never go stale
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

export const useActiveTrips = () => {
  return useQuery({
    queryKey: ["trips", "active"],
    queryFn: async () => {
      const { data, response } = await api.GET("/trips", {
        params: { query: { status: ["active"] } },
      });
      return isOk(data, response, "GET /trips?status=active");
    },
  });
};

export const useUpcomingTrips = () => {
  return useQuery({
    queryKey: ["trips", "scheduled"],
    queryFn: async () => {
      const { data, response } = await api.GET("/trips", {
        params: { query: { status: ["scheduled"] } },
      });
      return isOk(data, response, "GET /trips?status=scheduled");
    },
  });
};

export const useRecentTrips = (source?: TripSource) => {
  return useQuery({
    queryKey: ["trips", "recent", source ?? "all"],
    queryFn: async () => {
      const { data, response } = await api.GET("/trips", {
        params: {
          query: {
            status: ["completed", "cancelled"],
            source,
            limit: RECENT_TRIPS_LIMIT,
          },
        },
      });
      return isOk(data, response, "GET /trips (recent)");
    },
    // keep old rows while switching filters instead of flashing empty table
    placeholderData: keepPreviousData,
  });
};

export const useAvailable = (enabled: boolean) => {
  return useQuery({
    queryKey: ["available"],
    queryFn: async () => {
      const { data, response } = await api.GET("/vehicles/available");
      return isOk(data, response, "GET /vehicles/available");
    },
    enabled,
    refetchOnMount: "always",
  });
};

// rejects with a message
export const useCreateTrip = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewTrip) => {
      const result = await api
        .POST("/trips", { body })
        .catch(() => Promise.reject(new Error("Couldn't reach the server")));

      if (result.data) return result.data;

      throw new Error(
        result.error?.message ??
          `Couldn't schedule the trip (HTTP ${result.response.status})`,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["available"] });
    },
  });
};

const isOk = <T>(data: T | undefined, response: Response, label: string): T => {
  if (!response.ok || data === undefined) {
    throw new Error(`${label} failed: HTTP ${response.status}`);
  }
  return data;
};
