/**
 * Pipeline stage runner.
 *
 * Authority: PRD 5.1.2 — "Every stage must be a pure or explicitly
 * side-effecting function with structured logs, duration metrics, input/output
 * counts, and a stable error code." PRD 5.1.6 requires a build SLO report.
 *
 * The shape below is what makes that sentence enforceable rather than
 * aspirational. A stage declares its effects up front, so "which parts of this
 * build touch the network or the filesystem" is answerable by reading the stage
 * table instead of auditing every function. And because the runner times and
 * counts every stage, the SLO report is a by-product of running the pipeline
 * rather than a separate measurement that can drift from it.
 */

import type { RuleId, ValidationIssue } from "@atlas/contracts/rules";

/**
 * What a stage is allowed to touch.
 *
 * `pure` is the default and the majority. Anything else has to say so, which
 * is what lets `--offline` refuse to run a build that would hit the network.
 */
export const STAGE_EFFECTS = ["pure", "read-fs", "write-fs", "network"] as const;
export type StageEffect = (typeof STAGE_EFFECTS)[number];

export interface BuildClock {
  /**
   * The build timestamp, as an ISO string.
   *
   * Deliberately injected rather than read from `Date.now()`. PRD 5.1.3 requires
   * byte-identical artifacts from identical inputs, and `manifest.builtAt` is
   * part of an artifact — so a wall clock would break determinism on every run
   * and rule BLD-DETERMINISM-001 would fire against the build system itself.
   * Production derives this from the git commit timestamp; tests pin it.
   */
  now(): string;
}

export interface StageContext {
  readonly clock: BuildClock;
  /** Refuse network access. Set in CI and in every test run. */
  readonly offline: boolean;
  /** Accumulated issues. Warnings do not stop the build; errors do. */
  readonly issues: ValidationIssue[];
  readonly log: (message: string, fields?: Readonly<Record<string, unknown>>) => void;
}

export interface Stage<In, Out> {
  readonly name: string;
  readonly effects: readonly StageEffect[];
  /** How many items the stage handled, for the structured log. */
  readonly count?: (value: Out) => number;
  run(input: In, ctx: StageContext): Promise<Out> | Out;
}

/** A stage failure that carries a registry rule id, per PRD 5.1.6. */
export class StageError extends Error {
  readonly ruleId: RuleId | null;
  readonly stage: string;
  readonly issues: readonly ValidationIssue[];

  constructor(
    stage: string,
    message: string,
    options: { ruleId?: RuleId; issues?: readonly ValidationIssue[] } = {},
  ) {
    super(message);
    this.name = "StageError";
    this.stage = stage;
    this.ruleId = options.ruleId ?? null;
    this.issues = options.issues ?? [];
  }
}

export interface StageReport {
  readonly name: string;
  readonly effects: readonly StageEffect[];
  readonly durationMs: number;
  readonly outputCount: number | null;
}

export interface BuildReport {
  readonly stages: readonly StageReport[];
  readonly totalMs: number;
  readonly issues: readonly ValidationIssue[];
  readonly errorCount: number;
  readonly warningCount: number;
}

export function createContext(options: {
  clock: BuildClock;
  offline: boolean;
  verbose?: boolean;
}): StageContext {
  const issues: ValidationIssue[] = [];
  return {
    clock: options.clock,
    offline: options.offline,
    issues,
    log: (message, fields) => {
      if (options.verbose !== true) return;
      const suffix =
        fields === undefined
          ? ""
          : " " +
            Object.entries(fields)
              .map(([key, value]) => `${key}=${String(value)}`)
              .join(" ");
      process.stdout.write(`  ${message}${suffix}\n`);
    },
  };
}

/**
 * A build clock fixed to one instant.
 *
 * Production passes the git commit timestamp; tests pass a literal. Either way
 * the value is an input to the build rather than an ambient reading, which is
 * what keeps repeated builds byte-identical.
 */
export function fixedClock(iso: string): BuildClock {
  return { now: () => iso };
}

export interface RunOptions {
  readonly ctx: StageContext;
  /** Refuse to run any stage declaring an effect outside this set. */
  readonly allowEffects?: readonly StageEffect[];
}

/**
 * Run one stage, recording its duration and output count.
 *
 * Exported separately from `runPipeline` because the stages have heterogeneous
 * types; composing them in a typed chain would need either a large tuple type
 * or a cast. Calling this per stage keeps every hand-off type-checked.
 */
export async function runStage<In, Out>(
  stage: Stage<In, Out>,
  input: In,
  options: RunOptions,
  reports: StageReport[],
): Promise<Out> {
  const allowed = options.allowEffects;
  if (allowed !== undefined) {
    const forbidden = stage.effects.filter((effect) => !allowed.includes(effect));
    if (forbidden.length > 0) {
      throw new StageError(
        stage.name,
        `Stage '${stage.name}' declares effect(s) ${forbidden.join(", ")}, which this build forbids. ` +
          `Offline builds must not reach the network (PRD 5.1.4).`,
      );
    }
  }

  const started = performance.now();
  const output = await stage.run(input, options.ctx);
  const durationMs = Math.round((performance.now() - started) * 100) / 100;

  const outputCount = stage.count === undefined ? null : stage.count(output);
  reports.push({ name: stage.name, effects: stage.effects, durationMs, outputCount });
  options.ctx.log(
    `${stage.name} ${durationMs}ms`,
    outputCount === null ? undefined : { out: outputCount },
  );

  return output;
}

export function summarize(reports: readonly StageReport[], ctx: StageContext): BuildReport {
  const errorCount = ctx.issues.filter((i) => i.severity === "error").length;
  const warningCount = ctx.issues.filter((i) => i.severity === "warning").length;
  return {
    stages: reports,
    totalMs: Math.round(reports.reduce((sum, r) => sum + r.durationMs, 0) * 100) / 100,
    issues: ctx.issues,
    errorCount,
    warningCount,
  };
}

/** Render the PRD 5.1.6 build report. */
export function formatReport(report: BuildReport): string {
  const lines: string[] = ["", "Build report"];
  for (const stage of report.stages) {
    const count = stage.outputCount === null ? "" : ` ${String(stage.outputCount).padStart(6)} out`;
    lines.push(
      `  ${stage.name.padEnd(22)} ${String(stage.durationMs).padStart(9)} ms${count}` +
        `   [${stage.effects.join(",")}]`,
    );
  }
  lines.push(`  ${"total".padEnd(22)} ${String(report.totalMs).padStart(9)} ms`);
  lines.push(`  ${report.errorCount} error(s), ${report.warningCount} warning(s)`);
  return lines.join("\n");
}
