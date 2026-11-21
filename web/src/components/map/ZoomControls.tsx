import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

import { MinusIcon } from "../../icons/MinusIcon";
import { PlusIcon } from "../../icons/PlusIcon";

interface Props {
  map: MapLibreMap | null;
}

const BUTTON =
  "flex items-center justify-center p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 disabled:hover:text-muted-foreground [&_svg]:size-5";

export const ZoomControls = ({ map }: Props) => {
  const [isMax, setIsMax] = useState(false);
  const [isMin, setIsMin] = useState(false);

  useEffect(() => {
    if (!map) return;

    const sync = () => {
      setIsMax(map.getZoom() >= map.getMaxZoom());
      setIsMin(map.getZoom() <= map.getMinZoom());
    };
    sync();

    map.on("zoom", sync);
    return () => {
      map.off("zoom", sync);
    };
  }, [map]);

  return (
    <div
      role="group"
      aria-label="Zoom"
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card shadow-xs md:flex-row md:divide-x md:divide-y-0"
    >
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        disabled={!map || isMax}
        onClick={() => map?.zoomIn()}
        className={BUTTON}
      >
        <span aria-hidden="true" className="flex">
          <PlusIcon />
        </span>
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        disabled={!map || isMin}
        onClick={() => map?.zoomOut()}
        className={BUTTON}
      >
        <span aria-hidden="true" className="flex">
          <MinusIcon />
        </span>
      </button>
    </div>
  );
};
