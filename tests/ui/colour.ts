/**
 * Colour maths for the token tests.
 *
 * Authority: PRD 10.1 (`A11Y-CONTRAST-TEXT` 4.5:1, `A11Y-CONTRAST-LARGE` 3:1,
 * "tokens are tested in every theme").
 *
 * Extracted from `wallpaper.test.ts`, which had the only copy. Two files
 * computing contrast independently is two chances to compute it differently,
 * and a contrast helper that disagrees with itself is worse than none — both
 * suites would pass while describing different pages.
 *
 * Everything here reads the SHIPPED stylesheet. A test that restates the values
 * it checks agrees with every regression that changes them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const CSS = readFileSync(join(process.cwd(), "apps", "web", "app", "globals.css"), "utf8");

export type Rgb = readonly [number, number, number];

/** WCAG 2.x relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const channel = (value: number): number => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Composite `tint` at `alpha` over `backdrop`, as a browser would. */
export function over(tint: Rgb, alpha: number, backdrop: Rgb): Rgb {
  return [0, 1, 2].map((i) => alpha * tint[i]! + (1 - alpha) * backdrop[i]!) as unknown as Rgb;
}

export function fromHex(hex: string): Rgb {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

/** `--name: 12 34 56;` -> [12, 34, 56]. */
export function triplet(name: string, source: string = CSS): Rgb {
  const match = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`).exec(source);
  if (match === null) throw new Error(`no --${name} triplet in globals.css`);
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

export function scalar(name: string, source: string = CSS): number {
  const match = new RegExp(`--${name}:\\s*([\\d.]+)\\s*;`).exec(source);
  if (match === null) throw new Error(`no --${name} in globals.css`);
  return Number(match[1]);
}

/** `--name: #aabbcc;` -> rgb. */
export function hexToken(name: string, source: string = CSS): Rgb {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, "i").exec(source);
  if (match === null) throw new Error(`no --${name} hex in globals.css`);
  return fromHex(match[1]!);
}

/**
 * The two theme blocks, as separate strings.
 *
 * Light is the bare `:root`; dark is the `prefers-color-scheme` override, which
 * redefines only what changes. Reading them apart is what makes "tested in
 * every theme" mean anything — a single pass over the whole file would find the
 * light value for a token the dark block overrides and check the wrong pair.
 */
export function themeBlocks(): { light: string; dark: string } {
  const dark = /@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}\s*\}/.exec(CSS);
  if (dark === null) throw new Error("no prefers-color-scheme: dark :root block in globals.css");

  const rootStart = CSS.indexOf(":root {");
  if (rootStart === -1) throw new Error("no bare :root block in globals.css");
  const light = CSS.slice(rootStart, CSS.indexOf("\n}", rootStart));

  return { light, dark: dark[1]! };
}

/**
 * A token's value in one theme, falling back to light when dark does not
 * override it — which is exactly how the cascade resolves it in a browser.
 */
export function tokenIn(
  theme: { light: string; dark: string },
  which: "light" | "dark",
  name: string,
): Rgb {
  const source = which === "dark" ? theme.dark : theme.light;
  try {
    return hexToken(name, source);
  } catch {
    return hexToken(name, theme.light);
  }
}
