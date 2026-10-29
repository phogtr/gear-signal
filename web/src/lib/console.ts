import type { VehicleState } from "./ws/types";

export interface Readout {
  label: string;
  value: string;
  unit: string;
}

// "?vehicle=12" -> 12; anything else means nothing is selected
export const parseVehicleId = (param: string | null): number | null => {
  const id = Number(param);
  return param && Number.isInteger(id) && id > 0 ? id : null;
};

// units (m/s, 0..1 fractions, meters)
export const readouts = (s: VehicleState, routeDistance: number): Readout[] => {
  const rows: Readout[] = [
    {
      label: "Speed",
      value: Math.round(s.speed * 3.6).toString(), // m/s -> km/h
      unit: "km/h",
    },
  ];
  if (s.battery !== undefined) {
    rows.push({ label: "Battery", value: percent(s.battery), unit: "%" });
  }
  if (s.fuel !== undefined) {
    rows.push({ label: "Fuel", value: percent(s.fuel), unit: "%" });
  }
  if (s.engineTemp !== undefined) {
    rows.push({
      label: "Engine temp",
      value: s.engineTemp.toFixed(1),
      unit: "°C",
    });
  }

  const remaining = Math.max(routeDistance - s.distance, 0);
  rows.push(
    {
      label: "Progress",
      value: Math.round(s.progress * 100).toString(),
      unit: "%",
    },
    { label: "Remaining", value: (remaining / 1000).toFixed(1), unit: "km" },
  );
  return rows;
};

// one decimal; at SIM_SPEED 20, battery drop ~0.14% per tick
const percent = (fraction: number) => (fraction * 100).toFixed(1);
