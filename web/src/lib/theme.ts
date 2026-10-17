/**
 * reads a palette token from index.css (e.g. "primary" -> --color-primary),
 * then returns it as rgba() (MapLibre cant use Tailwind classes or parse oklch)
 */
export const themeColor = (name: string): string => {
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${name}`)
    .trim();
  return color ? toRgba(color) : color;
};

// paint one pixel on hidden canvas, then read it back
// browser converts CSS color to sRGB
let ctx: CanvasRenderingContext2D | null = null;

const toRgba = (color: string): string => {
  ctx ??= document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  if (!ctx) return color;

  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
};

/**
 * Tailwind doesn't work with `bg-${token}`, tokens are applied through CSS variables instead
 */
export const cssColor = (token: string) => `var(--color-${token})`;
