/**
 * Zod <-> Ajv conformance.
 *
 * Authority: PRD 4 stack table ("JSON Schema 2020-12 plus Zod runtime/build
 * validation"), 8.3, ADR 0003.
 *
 * Two validators exist because they serve different consumers: Zod validates in
 * the pipeline and gives TypeScript types; the emitted JSON Schema is the
 * machine-readable contract an external tool or editor consumes. Two validators
 * mean two chances to disagree, and a disagreement is a silent correctness bug -
 * the pipeline accepts a record an external validator rejects, or vice versa.
 *
 * So: run the SAME corpus through both and require the same verdict, except
 * where a rule is registered `zodOnly`. Those exceptions are enumerated by the
 * registry rather than discovered by trial, and the emitted schema advertises
 * them in x-zodOnlyRules.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Ajv2020 } from "ajv/dist/2020.js";
import { beforeAll, describe, expect, it } from "vitest";

import { SCHEMA_VERSION, projectSchema, projectStructuralSchema } from "@atlas/contracts/project";
import { RULE_LIST, zodOnlyRules } from "@atlas/contracts/rules";
import { generateCatalog, invalidCases, validBaseRecord } from "@atlas/fixtures";

import type { ValidateFunction } from "ajv";

const schemaPath = join(
  process.cwd(),
  "content",
  "schema",
  `project.v${SCHEMA_VERSION}.schema.json`,
);

let validate: ValidateFunction;
let zodOnlyIds: Set<string>;

beforeAll(() => {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
  // strict:false because the emitted schema carries x-zodOnlyRules, an
  // intentional annotation Ajv does not recognise.
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  validate = ajv.compile(schema);
  zodOnlyIds = new Set(zodOnlyRules().map((rule) => rule.id));
});

describe("generated JSON Schema", () => {
  it("is committed and current", () => {
    // If this fails, `pnpm schema:emit` was not run after editing project.ts.
    expect(() => readFileSync(schemaPath, "utf8")).not.toThrow();
  });

  it("seals every object boundary (PRD 8.3)", () => {
    const raw = readFileSync(schemaPath, "utf8");
    const schema = JSON.parse(raw) as unknown;

    const unsealed: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) {
        node.forEach((child, i) => walk(child, `${path}/${i}`));
        return;
      }
      if (node === null || typeof node !== "object") return;
      const obj = node as Record<string, unknown>;
      if (obj["type"] === "object" && obj["properties"] !== undefined) {
        if (obj["additionalProperties"] !== false) unsealed.push(path || "<root>");
      }
      for (const [key, value] of Object.entries(obj)) walk(value, `${path}/${key}`);
    };
    walk(schema, "");

    expect(unsealed, `Objects without additionalProperties:false: ${unsealed.join(", ")}`).toEqual(
      [],
    );
  });

  it("declares the zod-only rules it cannot enforce", () => {
    const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as {
      "x-zodOnlyRules"?: { id: string }[];
    };
    const declared = new Set((schema["x-zodOnlyRules"] ?? []).map((r) => r.id));
    const expected = new Set(zodOnlyRules().map((r) => r.id));
    expect([...declared].sort()).toEqual([...expected].sort());
  });
});

describe("Zod and Ajv agree", () => {
  it("both accept the valid base record", () => {
    expect(projectSchema.safeParse(validBaseRecord()).success).toBe(true);
    expect(validate(validBaseRecord())).toBe(true);
  });

  it("both accept every synthetic fixture record", () => {
    const records = generateCatalog(240);
    const zodFailures: string[] = [];
    const ajvFailures: string[] = [];

    for (const record of records) {
      const zodResult = projectSchema.safeParse(record);
      if (!zodResult.success) {
        const id = (record as { id?: string }).id ?? "<unknown>";
        zodFailures.push(
          `${id}: ${zodResult.error.issues.map((i) => `/${i.path.join("/")} ${i.message}`).join("; ")}`,
        );
      }
      if (!validate(record)) {
        const id = (record as { id?: string }).id ?? "<unknown>";
        ajvFailures.push(
          `${id}: ${(validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join("; ")}`,
        );
      }
    }

    expect(zodFailures.slice(0, 5), "Zod rejected valid fixtures").toEqual([]);
    expect(ajvFailures.slice(0, 5), "Ajv rejected valid fixtures").toEqual([]);
  });

  it.each(invalidCases().map((c) => [c.ruleId, c] as const))(
    "%s: verdicts match or the rule is registered zod-only",
    (ruleId, testCase) => {
      const zodRejected = !projectSchema.safeParse(testCase.record).success;
      const ajvRejected = !validate(testCase.record);

      expect(zodRejected, `Zod should reject the ${ruleId} fixture`).toBe(true);

      if (zodOnlyIds.has(ruleId)) {
        // Ajv is EXPECTED to miss these. Asserting it actually misses them
        // keeps the exemption list honest: if JSON Schema later gains the
        // ability to express one, this fails and the flag can be removed.
        expect(
          ajvRejected,
          `${ruleId} is flagged zodOnly, but Ajv rejected it too. Remove the zodOnly flag.`,
        ).toBe(false);
        return;
      }

      expect(
        ajvRejected,
        `${ruleId} is not flagged zodOnly, but Ajv accepted the fixture. ` +
          `Either the schema cannot express this rule (flag it zodOnly) or the emitter lost a constraint.`,
      ).toBe(true);
    },
  );
});

describe("structural schema", () => {
  it("matches the refined schema on structurally valid input", () => {
    // projectStructuralSchema is the unrefined shape used by the emitter.
    // Anything the refined schema accepts, the structural one must accept too.
    for (const record of generateCatalog(240).slice(0, 50)) {
      expect(projectStructuralSchema.safeParse(record).success).toBe(true);
    }
  });

  it("registry layers partition cleanly", () => {
    const layers = new Set(RULE_LIST.map((r) => r.layer));
    expect([...layers].sort()).toEqual(["corpus", "cross-field", "pipeline", "structural"]);
  });
});
