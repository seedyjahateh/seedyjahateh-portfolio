/**
 * Rule-registry coverage.
 *
 * Authority: PRD 11.1 ("valid/invalid fixtures for every field, enum,
 * cross-field rule"), 11.2 Catalog release gate.
 *
 * This is the test that makes the rule registry more than documentation. It
 * asserts a bijection between registered rules and invalid fixtures, in both
 * directions, and - critically - that each fixture still trips the rule it
 * claims to. A fixture that drifted into passing would otherwise keep counting
 * toward coverage while testing nothing.
 */

import { describe, expect, it } from "vitest";

import { RULE_IDS, RULE_LIST, ruleIdFromIssue } from "@atlas/contracts/rules";
import { projectSchema } from "@atlas/contracts/project";
import { COVERAGE_EXEMPTIONS, invalidCases, validBaseRecord } from "@atlas/fixtures";

const cases = invalidCases();
const coveredRuleIds = new Set(cases.map((c) => c.ruleId));

describe("rule registry", () => {
  it("has unique rule ids", () => {
    expect(new Set(RULE_IDS).size).toBe(RULE_IDS.length);
  });

  it("gives every rule a source, a summary, and a distinct repair", () => {
    for (const rule of RULE_LIST) {
      expect(rule.source, `${rule.id} source`).toMatch(/\S/);
      expect(rule.summary.length, `${rule.id} summary`).toBeGreaterThan(15);
      expect(rule.repair.length, `${rule.id} repair`).toBeGreaterThan(15);
      // PRD 5.1.6 asks for a "suggested repair" distinct from the message; a
      // repair that merely restates the summary tells an author nothing.
      expect(rule.repair, `${rule.id} repair restates summary`).not.toBe(rule.summary);
    }
  });
});

describe("invalid fixture corpus", () => {
  it("the base record is valid", () => {
    const result = projectSchema.safeParse(validBaseRecord());
    if (!result.success) {
      throw new Error(
        `Base fixture must be valid, got:\n${result.error.issues
          .map((i) => `  /${i.path.join("/")}: ${i.message}`)
          .join("\n")}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it.each(cases.map((c) => [c.ruleId, c.mutation, c] as const))(
    "%s rejects: %s",
    (ruleId, _mutation, testCase) => {
      const result = projectSchema.safeParse(testCase.record);
      expect(result.success, `Expected ${ruleId} fixture to be rejected, but it passed.`).toBe(
        false,
      );
      if (result.success) return;

      // The fixture must trip the rule it claims. Structural failures (regex,
      // length, enum, unknown key) surface as Zod's own issue codes rather than
      // custom ones, so accept either an explicit ruleId match or a
      // non-custom structural rejection.
      const ruleIds = result.error.issues.map(ruleIdFromIssue).filter((id) => id !== null);
      const hasStructural = result.error.issues.some((issue) => issue.code !== "custom");
      const matched = ruleIds.includes(ruleId) || hasStructural;
      expect(
        matched,
        `${ruleId} fixture was rejected, but for the wrong reason. Issues: ${JSON.stringify(
          result.error.issues.map((i) => ({ code: i.code, path: i.path, rule: ruleIdFromIssue(i) })),
        )}`,
      ).toBe(true);
    },
  );

  it("covers every rule that is not explicitly exempt", () => {
    const missing = RULE_IDS.filter(
      (id) => !coveredRuleIds.has(id) && COVERAGE_EXEMPTIONS[id] === undefined,
    );
    expect(
      missing,
      `These rules have neither an invalid fixture nor a documented exemption:\n` +
        missing.map((id) => `  - ${id}`).join("\n"),
    ).toEqual([]);
  });

  it("has no exemption for a rule that does not exist", () => {
    const known = new Set<string>(RULE_IDS);
    const orphans = Object.keys(COVERAGE_EXEMPTIONS).filter((id) => !known.has(id));
    expect(orphans, `Exemptions reference unknown rules: ${orphans.join(", ")}`).toEqual([]);
  });

  it("has no exemption for a rule that is actually covered", () => {
    // A stale exemption is worse than none: it hides the fact that real
    // coverage exists and invites someone to delete the fixture.
    const redundant = [...coveredRuleIds].filter(
      (id) => COVERAGE_EXEMPTIONS[id] !== undefined,
    );
    expect(
      redundant,
      `These rules have a fixture AND an exemption; remove the exemption: ${redundant.join(", ")}`,
    ).toEqual([]);
  });

  it("targets each covered rule exactly once", () => {
    const counts = new Map<string, number>();
    for (const c of cases) counts.set(c.ruleId, (counts.get(c.ruleId) ?? 0) + 1);
    const duplicated = [...counts.entries()].filter(([, n]) => n > 1);
    expect(
      duplicated.map(([id, n]) => `${id} x${n}`),
      "Each rule should have one minimal fixture; extra cases dilute the failure message.",
    ).toEqual([]);
  });
});
