import uPlot from "uplot";

import type { Threshold } from "./console";

const FONT_PX = 10;
const FONT_FAMILY = `"Fira Code Variable", monospace`;

export const CHART_FONT = `${FONT_PX}px ${FONT_FAMILY}`;

export const ySplits = (_u: uPlot, _i: number, min: number, max: number) => {
  const out = [];
  for (let v = Math.ceil(min / 50) * 50; v <= max; v += 50) out.push(v);
  return out;
};

export const drawThreshold =
  (t: Threshold, color: string, textColor: string) => (u: uPlot) => {
    const px = uPlot.pxRatio;
    const y = Math.round(u.valToPos(t.value, "y", true)) + 0.5;
    const { left, width } = u.bbox;
    const ctx = u.ctx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = px;
    ctx.setLineDash([4 * px, 4 * px]);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + width, y);
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = `${FONT_PX * px}px ${FONT_FAMILY}`;
    ctx.textAlign = "right";
    ctx.textBaseline = t.when === "above" ? "bottom" : "top";
    ctx.fillText(
      `alert ${t.when === "above" ? ">" : "<"} ${t.value}`,
      left + width - 4 * px,
      y + (t.when === "above" ? -3 : 3) * px,
    );
    ctx.restore();
  };
