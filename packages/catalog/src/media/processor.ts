/**
 * Build-time media pipeline.
 *
 * Authority: PRD 4 ("build-time image pipeline producing AVIF/WebP/JPEG
 * fallbacks and intrinsic dimensions"), 9.6 (card ≤45 KB, hero ≤140 KB),
 * 5.1.3 (reject image records without intrinsic width and height), ADR 0016.
 *
 * WHY BUILD TIME. PRD 1.1 computes that 1,300 thumbnails at 800x450 would need
 * about 1.87 GB of decoded pixel memory. Serving a 1600 px source into a 320 px
 * slot is how that happens, so every derivative is produced here with a known
 * width and the markup is given the real intrinsic dimensions. Reserved
 * geometry is also what makes CLS <= 0.05 achievable at all: a slow or failed
 * image then shifts nothing.
 *
 * No manifest currently references an image, so this has no live input yet. It
 * is proven against generated fixtures and starts working the day one does.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import sharp from "sharp";

/** Widths emitted for responsive `srcset`. */
export const CARD_WIDTHS = [400, 800, 1200] as const;
export const HERO_WIDTHS = [800, 1600, 2400] as const;

export type MediaKind = "card" | "hero";

export interface Derivative {
  readonly path: string;
  readonly format: "avif" | "webp" | "jpeg";
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

export interface ProcessedImage {
  /** Intrinsic dimensions of the SOURCE, written back to satisfy MED-DIM-001. */
  readonly width: number;
  readonly height: number;
  readonly derivatives: readonly Derivative[];
  /** True when the result was reused from cache rather than recomputed. */
  readonly cached: boolean;
}

export interface ProcessOptions {
  readonly sourcePath: string;
  readonly outDir: string;
  /** Public URL prefix the derivatives will be served from. */
  readonly urlPrefix: string;
  readonly kind: MediaKind;
  /** Cache directory keyed by source content hash. */
  readonly cacheDir: string;
}

/**
 * Quality settings.
 *
 * Chosen so a typical 800x450 screenshot lands under the 45 KB card budget in
 * AVIF. They are starting points, not physics: if a real image misses the
 * budget the answer is a smaller source or a tighter crop, never a raised
 * budget (PRD 12.2).
 */
const QUALITY = { avif: 50, webp: 72, jpeg: 78 } as const;

function contentHash(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 16);
}

/**
 * Produce AVIF, WebP and a JPEG fallback at each responsive width.
 *
 * Cached on the source content hash. This is the stage that would otherwise
 * blow the 30 s warm-rebuild SLO in PRD 5.1.6 — re-encoding unchanged images is
 * by far the most expensive thing the pipeline can do.
 */
export async function processImage(options: ProcessOptions): Promise<ProcessedImage> {
  const source = readFileSync(options.sourcePath);
  const hash = contentHash(source);
  const manifestPath = join(options.cacheDir, `${hash}.json`);

  if (existsSync(manifestPath)) {
    const cached = JSON.parse(readFileSync(manifestPath, "utf8")) as ProcessedImage;
    if (
      cached.derivatives.every((d) =>
        existsSync(join(options.outDir, d.path.split("/").pop() ?? "")),
      )
    ) {
      return { ...cached, cached: true };
    }
  }

  const image = sharp(source);
  const meta = await image.metadata();
  // sharp types these as required, but a corrupt file can still yield 0,
  // which the guard below turns into an actionable MED-DIM-001 message.
  const width = meta.width;
  const height = meta.height;

  if (width === 0 || height === 0) {
    throw new Error(
      `MED-DIM-001: could not read intrinsic dimensions from ${options.sourcePath}. ` +
        `Every image record must declare width and height (PRD 5.1.3).`,
    );
  }

  const widths = (options.kind === "card" ? CARD_WIDTHS : HERO_WIDTHS).filter((w) => w <= width);
  // Always emit at least one derivative, even for a small source.
  if (widths.length === 0) widths.push(width as never);

  mkdirSync(options.outDir, { recursive: true });
  mkdirSync(options.cacheDir, { recursive: true });

  const derivatives: Derivative[] = [];

  for (const targetWidth of widths) {
    const resized = sharp(source).resize({ width: targetWidth, withoutEnlargement: true });
    const targetHeight = Math.round((height / width) * targetWidth);

    for (const format of ["avif", "webp", "jpeg"] as const) {
      const buffer =
        format === "avif"
          ? await resized.clone().avif({ quality: QUALITY.avif }).toBuffer()
          : format === "webp"
            ? await resized.clone().webp({ quality: QUALITY.webp }).toBuffer()
            : await resized.clone().jpeg({ quality: QUALITY.jpeg, mozjpeg: true }).toBuffer();

      const name = `${hash}-${targetWidth}.${format === "jpeg" ? "jpg" : format}`;
      writeFileSync(join(options.outDir, name), buffer);
      derivatives.push({
        path: `${options.urlPrefix}/${name}`,
        format,
        width: targetWidth,
        height: targetHeight,
        bytes: buffer.byteLength,
      });
    }
  }

  const result: ProcessedImage = { width, height, derivatives, cached: false };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(result), "utf8");
  return result;
}

/**
 * Check a processed image against the PRD 9.6 transfer budgets.
 *
 * Only the modern format at the largest emitted width is judged: that is what a
 * current browser actually downloads. Judging the JPEG fallback would fail
 * budgets on bytes almost nobody receives.
 */
export function budgetFor(kind: MediaKind): { id: string; limitKb: number } {
  return kind === "card"
    ? { id: "NET-CARD-IMAGE", limitKb: 45 }
    : { id: "NET-HERO-IMAGE", limitKb: 140 };
}

export function largestModernBytes(image: ProcessedImage): number {
  const avif = image.derivatives.filter((d) => d.format === "avif");
  if (avif.length === 0) return 0;
  return avif.reduce((max, d) => Math.max(max, d.bytes), 0);
}
