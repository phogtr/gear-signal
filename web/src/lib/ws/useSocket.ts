import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { connectSocket } from "./socket";

const socketUrl = () => {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/api/ws`;
};

// streams vehicles into useSocketStore, and
// refetch parked vehicles, active trips whenever a trip starts/finishes
export const useSocket = () => {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      connectSocket(socketUrl(), () => {
        queryClient.invalidateQueries({ queryKey: ["vehicles"] });
        queryClient.invalidateQueries({ queryKey: ["trips"] });
      }),
    [queryClient],
  );
};
