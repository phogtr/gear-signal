import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { connectSocket } from "./socket";

const socketUrl = () => {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/api/ws`;
};

// stream vehicles & events into useSocketStore, &
// refetch parked vehicles, active trips whenever a trip start/finish
export const useSocket = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const refetchTrips = () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
    };

    return connectSocket(socketUrl(), {
      onTripsChanged: refetchTrips,
      onReconnect: () => {
        refetchTrips();
        queryClient.invalidateQueries({ queryKey: ["events"] });
      },
    });
  }, [queryClient]);
};
