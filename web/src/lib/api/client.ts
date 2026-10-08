import createClient from "openapi-fetch";

import type { components, paths } from "./schema";

export const api = createClient<paths>({ baseUrl: "/api" });

type Schemas = components["schemas"];
export type Depot = Schemas["Depot"];
export type Route = Schemas["Route"];
export type Vehicle = Schemas["Vehicle"];
export type Trip = Schemas["Trip"];
