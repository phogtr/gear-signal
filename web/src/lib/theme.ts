/**
 * reads a palette token from index.css (e.g. "primary" -> --color-primary),
 * then returns the color (MapLibre cant use Tailwind classes)
 */
export const themeColor = (name: string): string =>
  getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${name}`)
    .trim();
