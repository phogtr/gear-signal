import { createBrowserRouter, Navigate } from "react-router";

import { App } from "./App";

import { ConsolePage } from "./pages/console/ConsolePage";
import { SchedulePage } from "./pages/schedule/SchedulePage";
import { MapPage } from "./pages/map/MapPage";
import { ReplayPage } from "./pages/replay/ReplayPage";

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
    children: [
      { index: true, element: <Navigate to={`/${MAP_ROUTE}`} replace /> },
      { path: MAP_ROUTE, element: <MapPage /> },
      { path: SCHEDULE_ROUTE, element: <SchedulePage /> },
      { path: CONSOLE_ROUTE, element: <ConsolePage /> },
      { path: REPLAY_ROUTE, element: <ReplayPage /> },
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
