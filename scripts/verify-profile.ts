/**
 * Report unauthored profile fields.
 *
 * Authority: PRD 6.2 (the home page must state a positioning sentence and keep
 * résumé/GitHub/contact reachable), 12.2 (nothing about a real person is
 * invented).
 *
 * This EXITS ZERO even with gaps. An unfinished profile is a normal state for a
 * site under construction, not a build error — the point is to make the gaps
 * visible and specific rather than to block. It exits non-zero only if the file
 * is missing or malformed, which is a real defect.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { profileSchema, profileGaps } from "../apps/web/lib/profile.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const profilePath = join(repoRoot, "content", "profile.v1.json");

function main(): void {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(profilePath, "utf8"));
  } catch (error) {
    process.stderr.write(`content/profile.v1.json could not be read or parsed: ${String(error)}\n`);
    process.exit(1);
  }

  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    process.stderr.write("content/profile.v1.json is invalid:\n");
    for (const issue of parsed.error.issues) {
      process.stderr.write(`  - /${issue.path.join("/")}: ${issue.message}\n`);
    }
    process.exit(1);
  }

  const gaps = profileGaps(parsed.data);
  if (gaps.length === 0) {
    process.stdout.write("profile complete\n");
    return;
  }

  const blocking = gaps.filter((g) => g.blocksPublish);
  const optional = gaps.filter((g) => !g.blocksPublish);

  process.stdout.write(`profile has ${gaps.length} unauthored field(s)\n\n`);

  if (blocking.length > 0) {
    process.stdout.write("Needed before the site is publishable:\n");
    for (const gap of blocking) process.stdout.write(`  ${gap.field}\n    ${gap.why}\n`);
    process.stdout.write("\n");
  }
  if (optional.length > 0) {
    process.stdout.write("Optional, but the page is thin without them:\n");
    for (const gap of optional) process.stdout.write(`  ${gap.field}\n    ${gap.why}\n`);
    process.stdout.write("\n");
  }

  process.stdout.write("Edit content/profile.v1.json. The site builds and renders honest\n");
  process.stdout.write("absences until these are filled in - nothing is generated for you.\n");
}

main();
