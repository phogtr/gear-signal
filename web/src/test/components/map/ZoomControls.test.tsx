// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { ZoomControls } from "../../../components/map/ZoomControls";

const fakeMap = (zoom: number) => {
  const handlers: (() => void)[] = [];
  const map = {
    zoom,
    getZoom: () => map.zoom,
    getMinZoom: () => 0,
    getMaxZoom: () => 22,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    on: (_: string, fn: () => void) => handlers.push(fn),
    off: vi.fn(),
    fire: () => handlers.forEach((fn) => fn()),
  };
  return map;
};

describe("ZoomControls", () => {
  it("is disabled until the map exists", () => {
    render(<ZoomControls map={null} />);
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });

  it("zooms the map", async () => {
    const map = fakeMap(10);
    render(<ZoomControls map={map as unknown as MapLibreMap} />);
    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(map.zoomIn).toHaveBeenCalledOnce();
    expect(map.zoomOut).toHaveBeenCalledOnce();
  });

  it("disables a button at the zoom limit", () => {
    const map = fakeMap(10);
    render(<ZoomControls map={map as unknown as MapLibreMap} />);
    act(() => {
      map.zoom = 22;
      map.fire();
    });
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeEnabled();
  });
});
