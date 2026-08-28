/**
 * Site profile: the personal content behind home, résumé, and contact.
 *
 * Authority: PRD 6.2 items 1 and 6 (positioning sentence; résumé, GitHub and
 * contact reachable without scrolling), 6.1 (`/resume`, `/contact`).
 *
 * WHY THIS IS A DATA FILE AND NOT HARDCODED COPY. A positioning sentence, an
 * availability statement, and a résumé are claims about a real person. PRD
 * 12.2 forbids inventing them, so they live in a reviewed file the site owner
 * authors, exactly like a project manifest.
 *
 * MISSING FIELDS WARN, THEY DO NOT FAIL. The site has to build and be
 * inspectable before it is finished, so unauthored fields render as honest
 * absences and `pnpm profile:verify` prints what is still needed. A field that
 * is present but empty is treated as absent, never as an empty claim.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

const nonEmpty = (schema: z.ZodString) => schema.trim().min(1);

const linkSchema = z.strictObject({
  label: nonEmpty(z.string().max(60)),
  url: z.string().max(300),
  /** Show in the header/above the fold (PRD 6.2 item 6). */
  primary: z.boolean().default(false),
});

const skillGroupSchema = z.strictObject({
  group: nonEmpty(z.string().max(60)),
  items: z.array(nonEmpty(z.string().max(60))).min(1),
});

const resumeEntrySchema = z.strictObject({
  title: nonEmpty(z.string().max(160)),
  organization: z.string().max(160).default(""),
  period: z.string().max(60).default(""),
  detail: z.array(z.string().max(400)).default([]),
});

export const profileSchema = z.strictObject({
  version: z.literal(1),

  /**
   * In-file authoring guidance. Ignored by every consumer, but kept in the
   * schema so the notes can live next to the fields they describe instead of
   * in a separate document nobody opens.
   */
  _authoring: z.array(z.string()).optional(),

  /** Display name. Empty until authored. */
  name: z.string().max(120).default(""),

  /**
   * PRD 6.2 item 1: "One sentence stating the three target roles and
   * engineering specialization." One sentence - the template does not wrap it
   * in additional marketing copy.
   */
  positioning: z.string().max(400).default(""),

  /** Optional short availability line, e.g. "Open to 2026 internships". */
  availability: z.string().max(200).default(""),

  location: z.string().max(120).default(""),

  links: z.array(linkSchema).default([]),

  contact: z
    .strictObject({
      /** Publishing an address is the owner's decision, never a default. */
      email: z.string().max(200).default(""),
      note: z.string().max(400).default(""),
      methods: z.array(linkSchema).default([]),
    })
    .default({ email: "", note: "", methods: [] }),

  resume: z
    .strictObject({
      /** Versioned PDF alongside the accessible HTML résumé (PRD 6.1). */
      pdfUrl: z.string().max(300).default(""),
      summary: z.string().max(600).default(""),
      experience: z.array(resumeEntrySchema).default([]),
      education: z.array(resumeEntrySchema).default([]),
      /**
       * Grouped, not a flat list.
       *
       * A résumé's skill groupings carry meaning — "Languages" and "Practices"
       * are read differently — so the grouping is structural rather than a
       * label smuggled into the front of a string.
       */
      skills: z.array(skillGroupSchema).default([]),
    })
    .default({ pdfUrl: "", summary: "", experience: [], education: [], skills: [] }),
});

export type Profile = z.output<typeof profileSchema>;

const PROFILE_PATH = join(process.cwd(), "..", "..", "content", "profile.v1.json");

let cached: Profile | null = null;

export function loadProfile(): Profile {
  if (cached !== null) return cached;
  const raw: unknown = JSON.parse(readFileSync(PROFILE_PATH, "utf8"));
  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `content/profile.v1.json is invalid:\n` +
        result.error.issues.map((i) => `  - /${i.path.join("/")}: ${i.message}`).join("\n"),
    );
  }
  cached = result.data;
  return cached;
}

/** A value counts as authored only if it is a non-blank string. */
export function authored(value: string | undefined | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export interface ProfileGap {
  readonly field: string;
  readonly why: string;
  readonly blocksPublish: boolean;
}

/**
 * Report unauthored fields.
 *
 * `blocksPublish` marks what PRD 6.2 requires the home page to state. The site
 * still builds without them; it just cannot honestly be called finished.
 */
export function profileGaps(profile: Profile): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  const need = (field: string, value: string, why: string, blocksPublish = true): void => {
    if (!authored(value)) gaps.push({ field, why, blocksPublish });
  };

  need("name", profile.name, "Used as the site title and résumé heading.");
  need(
    "positioning",
    profile.positioning,
    "PRD 6.2 item 1: one sentence stating the three target roles and specialization.",
  );
  need(
    "contact.email",
    profile.contact.email,
    "PRD 6.1: /contact needs a low-friction path. Publishing an address is your call.",
    false,
  );
  need("resume.summary", profile.resume.summary, "Opening paragraph of the HTML résumé.", false);
  need("resume.pdfUrl", profile.resume.pdfUrl, "PRD 6.1: versioned PDF alongside HTML.", false);

  if (profile.links.length === 0) {
    gaps.push({
      field: "links",
      why: "PRD 6.2 item 6: résumé, GitHub and contact reachable without scrolling.",
      blocksPublish: true,
    });
  }
  if (profile.resume.experience.length === 0 && profile.resume.education.length === 0) {
    gaps.push({
      field: "resume.experience / resume.education",
      why: "An empty résumé page has nothing to show.",
      blocksPublish: false,
    });
  }

  return gaps;
}
