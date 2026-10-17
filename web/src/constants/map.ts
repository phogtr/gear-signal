import type { Vehicle } from "../lib/api/client";

export const INFO_COLOR = "info";
export const MUTED_FOREGROUND_COLOR = "muted-foreground";
export const SUCCESS_COLOR = "success";
export const WARNING_COLOR = "warning";

export const VEHICLE_STATUSES: {
  status: Vehicle["status"];
  label: string;
  color: string;
}[] = [
  { status: "en_route", label: "En route", color: INFO_COLOR },
  { status: "idle", label: "Idle", color: MUTED_FOREGROUND_COLOR },
  { status: "charging", label: "Charging", color: SUCCESS_COLOR },
  { status: "maintenance", label: "Maintenance", color: WARNING_COLOR },
];

export const VEHICLE_TYPE_LABELS: Record<Vehicle["type"], string> = {
  ev_van: "EV van",
  diesel_truck: "Diesel truck",
};
