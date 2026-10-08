import { NavLink, Outlet } from "react-router";

import { MapPinIcon } from "../icons/MapPinIcon";
import { WaypointsIcon } from "../icons/WaypointsIcon";
import { ActivityIcon } from "../icons/ActivityIcon";
import { AirplayIcon } from "../icons/AirplayIcon";

import {
  CONSOLE_ROUTE,
  MAP_ROUTE,
  REPLAY_ROUTE,
  SCHEDULE_ROUTE,
} from "../constants/routes";

const sections = [
  { to: `/${MAP_ROUTE}`, label: "Map", icon: <MapPinIcon /> },
  { to: `/${SCHEDULE_ROUTE}`, label: "Schedule", icon: <WaypointsIcon /> },
  { to: `/${CONSOLE_ROUTE}`, label: "Console", icon: <ActivityIcon /> },
  { to: `/${REPLAY_ROUTE}`, label: "Replay", icon: <AirplayIcon /> },
];

export const App = () => {
  return (
    <div className="flex h-dvh flex-col-reverse sm:flex-row">
      <nav
        aria-label="Primary"
        className="flex shrink-0 border-t border-border bg-surface sm:w-16 sm:flex-col sm:border-t-0 sm:border-r"
      >
        <div className="hidden h-16 items-center justify-center sm:flex">
          <span
            aria-hidden="true"
            className="font-bold tracking-widest text-xl text-foreground"
          >
            GS
          </span>
          <span className="sr-only">Gear Signal</span>
        </div>

        <ul className="flex flex-1 sm:flex-none sm:flex-col sm:gap-1 sm:px-2">
          {sections.map((s) => (
            <li key={s.to} className="flex-1 sm:flex-none">
              <NavLink
                to={s.to}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 rounded py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
                    isActive
                      ? "text-foreground"
                      : "text-muted hover:text-foreground"
                  }`
                }
              >
                {s.icon}

                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main
        id="main"
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto"
      >
        <Outlet />
      </main>
    </div>
  );
};
