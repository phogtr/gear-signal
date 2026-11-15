import { createBrowserRouter, Navigate } from "react-router";

import { App } from "./App";
import { SchedulePage } from "./pages/schedule/SchedulePage";
import { Placeholder } from "../components/Placeholder";

import {
  CONSOLE_ROUTE,
  MAP_ROUTE,
  REPLAY_ROUTE,
  SCHEDULE_ROUTE,
} from "../constants/routes";

export const router = createBrowserRouter([
  {
    element: <App />,
    hydrateFallbackElement: <div className="h-dvh bg-background" />,
    children: [
      { index: true, element: <Navigate to={`/${MAP_ROUTE}`} replace /> },
      {
        path: MAP_ROUTE,
        lazy: async () => ({
          Component: (await import("./pages/map/MapPage")).MapPage,
        }),
      },
      { path: SCHEDULE_ROUTE, element: <SchedulePage /> },
      {
        path: CONSOLE_ROUTE,
        lazy: async () => ({
          Component: (await import("./pages/console/ConsolePage")).ConsolePage,
        }),
      },
      {
        path: REPLAY_ROUTE,
        lazy: async () => ({
          Component: (await import("./pages/replay/ReplayPage")).ReplayPage,
        }),
      },
      {
        path: "*",
        element: (
          <Placeholder
            title="Not found"
            description="This page does not exist."
          />
        ),
      },
    ],
  },
]);
