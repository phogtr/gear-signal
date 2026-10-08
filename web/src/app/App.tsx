import { NavLink, Outlet } from "react-router";

import {
  CONSOLE_ROUTE,
  MAP_ROUTE,
  REPLAY_ROUTE,
  SCHEDULE_ROUTE,
} from "../constants/routes";

const sections = [
  { to: `/${MAP_ROUTE}`, label: "Map" },
  { to: `/${SCHEDULE_ROUTE}`, label: "Schedule" },
  { to: `/${CONSOLE_ROUTE}`, label: "Console" },
  { to: `/${REPLAY_ROUTE}`, label: "Replay" },
];

export const App = () => {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-amber-400 focus:px-3 focus:py-2 focus:text-zinc-950"
      >
        Skip to content
      </a>

      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-800 px-4 py-3">
        <span className="text-sm font-semibold tracking-widest text-amber-400 uppercase">
          Gear Signal
        </span>

        <nav aria-label="Primary" className="-mx-1 overflow-x-auto">
          <ul className="flex gap-1">
            {sections.map((s) => (
              <li key={s.to}>
                <NavLink
                  to={s.to}
                  className={({ isActive }) =>
                    `block rounded px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
                      isActive
                        ? "bg-zinc-800 text-zinc-50"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                    }`
                  }
                >
                  {s.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
};
