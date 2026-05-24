// ─── Conversion Utilities ────────────────────────────────────────────

/** Parse an HSL string like "228 20% 10%" into { h, s, l } */
export function parseHsl(hsl: string): { h: number; s: number; l: number } {
  const parts = hsl.trim().replace(/%/g, '').split(/\s+/).map(Number);
  return { h: parts[0], s: parts[1], l: parts[2] };
}

/** Convert HSL to RGB. h in [0,360], s,l in [0,100]. Returns [r,g,b] each [0,255]. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Convert hex color (#RRGGBB or #RGB) to RGB. */
function hexToRgb(hex: string): [number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Convert RGB to hex (#rrggbb). */
export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ─── Luminance & Contrast ─────────────────────────────────────────────

/** Relative luminance per WCAG 2.1 (0 = black, 1 = white). */
function getLuminance(r: number, g: number, b: number): number {
  const sRGB = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRGB[0] + 0.7152 * sRGB[1] + 0.0722 * sRGB[2];
}

/** WCAG contrast ratio between two colors (each as [r,g,b]). */
export function getContrastRatio(
  rgb1: [number, number, number],
  rgb2: [number, number, number],
): number {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Dark/Light Detection ─────────────────────────────────────────────

/** Determine if an HSL background string represents a "dark" theme. */
export function isDarkTheme(backgroundHsl: string): boolean {
  const { h, s, l } = parseHsl(backgroundHsl);
  const [r, g, b] = hslToRgb(h, s, l);
  return getLuminance(r, g, b) < 0.2;
}

/** Resolve the live --background CSS variable to `"dark"` or `"light"`. */
export function getBackgroundThemeMode(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'light';
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue('--background')
    .trim();
  if (!bg) return 'light';
  return isDarkTheme(bg) ? 'dark' : 'light';
}

// ─── Adjust HSL helpers ───────────────────────────────────────────────

// ─── Hex color manipulation ───────────────────────────────────────────

/** Darken a hex color by a factor (0 = no change, 1 = black). */
export function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const dark = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return rgbToHex(dark(r), dark(g), dark(b));
}

/** Lighten a hex color by a factor (0 = no change, 1 = white). */
export function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const light = (c: number) => Math.min(255, Math.round(c + (255 - c) * amount));
  return rgbToHex(light(r), light(g), light(b));
}

/** Blend two hex colors by a factor (0 = hex1, 1 = hex2). */
export function blendHex(hex1: string, hex2: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * amount),
    Math.round(g1 + (g2 - g1) * amount),
    Math.round(b1 + (b2 - b1) * amount),
  );
}

// ─── Letter stationery color utilities ────────────────────────────────

/** WCAG 2.1 relative luminance of a hex color (0 = black, 1 = white). */
export function hexLuminance(hex: string): number {
  if (!hex) return 0.5;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * Derive a readable text color for a given palette of hex colors.
 * avgLum > 0.5 → dark text; avgLum ≤ 0.5 → light text
 */
export function paletteTextColor(colors: string[]): string {
  if (colors.length === 0) return 'rgba(0,0,0,0.75)';
  const avg = colors.reduce((sum, c) => sum + hexLuminance(c), 0) / colors.length;
  return avg > 0.5 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.90)';
}

/** Derive a readable text color for a single background hex color. */
export function backgroundTextColor(bgHex: string): string {
  return hexLuminance(bgHex) > 0.5
    ? 'rgba(0,0,0,0.75)'
    : 'rgba(255,255,255,0.90)';
}

/** Faint text color for secondary elements (palette version). */
export function paletteTextColorFaint(colors: string[]): string {
  if (colors.length === 0) return 'rgba(0,0,0,0.30)';
  const avg = colors.reduce((sum, c) => sum + hexLuminance(c), 0) / colors.length;
  return avg > 0.5 ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.35)';
}

/** Faint text color for secondary elements (single background version). */
export function backgroundTextColorFaint(bgHex: string): string {
  return hexLuminance(bgHex) > 0.5
    ? 'rgba(0,0,0,0.30)'
    : 'rgba(255,255,255,0.35)';
}

/** Ruled-line color for letter stationery (palette version). */
export function paletteLineColor(colors: string[]): string {
  if (colors.length === 0) return 'rgba(0,0,0,0.08)';
  const avg = colors.reduce((sum, c) => sum + hexLuminance(c), 0) / colors.length;
  return avg > 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)';
}

/** Ruled-line color for letter stationery (single background version). */
export function backgroundLineColor(bgHex: string): string {
  return hexLuminance(bgHex) > 0.5
    ? 'rgba(0,0,0,0.08)'
    : 'rgba(255,255,255,0.15)';
}
