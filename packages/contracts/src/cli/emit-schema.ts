/**
 * Emit JSON Schema 2020-12 from the Zod source of truth.
 *
 * Authority: PRD 4 ("JSON Schema 2020-12 plus Zod runtime/build validation"),
 * 8.3 (additionalProperties:false at every boundary), 5.1.3 (deterministic
 * builds).
 *
 * Output is committed to content/schema/ and CI asserts a clean regeneration
 * diff, so the checked-in schema can never drift from the code that produced it.
 *
 * io: "input" is deliberate. content/projects/*.json are AUTHORED documents,
 * validated before Zod applies any .default(), so the schema must describe the
 * input shape. Emitting output mode would wrongly mark defaulted fields
 * required and reject valid manifests.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { canonicalJson } from "../canonical-json.js";
import { SCHEMA_VERSION, projectStructuralSchema } from "../project.js";
import { RULE_LIST, zodOnlyRules } from "../rules/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const outputDir = join(repoRoot, "content", "schema");

function emitProjectSchema(): Record<string, unknown> {
  const base = z.toJSONSchema(projectStructuralSchema, {
    target: "draft-2020-12",
    io: "input",
  }) as Record<string, unknown>;

  return {
    ...base,
    $id: `https://project-atlas.local/schema/project.v${SCHEMA_VERSION}.schema.json`,
    title: `Project (schema v${SCHEMA_VERSION})`,
    description:
      "Canonical catalog record. Generated from packages/contracts/src/project.ts - do not hand-edit. " +
      "Structural and single-record conditional rules are enforced here; rules listed in " +
      "x-zodOnlyRules cannot be expressed in JSON Schema and are enforced by Zod refinements " +
      "or corpus passes instead.",
    /**
     * Honesty annotation. A consumer validating with Ajv alone gets LESS
     * checking than the pipeline does, and needs to know exactly how much less.
     */
    "x-zodOnlyRules": zodOnlyRules().map((rule) => ({
      id: rule.id,
      layer: rule.layer,
      source: rule.source,
      summary: rule.summary,
    })),
  };
}

function emitRuleRegistry(): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://project-atlas.local/schema/validation-rules.v1.json",
    title: "Validation rule registry v1",
    description:
      "Every rejection rule in PRD 5.1.3 and 8.3, plus the promotion gates from " +
      "portfolio-project-selection.md. Generated from packages/contracts/src/rules/registry.ts.",
    rules: RULE_LIST.map((rule) => ({
      id: rule.id,
      layer: rule.layer,
      severity: rule.severity,
      source: rule.source,
      summary: rule.summary,
      repair: rule.repair,
      zodOnly: rule.zodOnly === true,
    })),
  };
}

function main(): void {
  mkdirSync(outputDir, { recursive: true });

  const targets: readonly [string, unknown][] = [
    [`project.v${SCHEMA_VERSION}.schema.json`, emitProjectSchema()],
    ["validation-rules.v1.json", emitRuleRegistry()],
  ];

  for (const [name, value] of targets) {
    const path = join(outputDir, name);
    writeFileSync(path, canonicalJson(value), "utf8");
    process.stdout.write(`emitted content/schema/${name}\n`);
  }

  const zodOnlyCount = zodOnlyRules().length;
  process.stdout.write(
    `${RULE_LIST.length} rules registered; ${zodOnlyCount} are not expressible in JSON Schema.\n`,
  );
}

main();
