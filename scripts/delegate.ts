/**
 * Task dispatcher.
 *
 * Hands a bounded piece of work to another agent with enough project context
 * that it cannot break rules it has no way to infer, then verifies the result
 * and reports honestly.
 *
 * Local development tooling. Nothing here ships, and nothing it writes enters
 * the catalog or the published site.
 *
 * WHY A BRIEF IS THE WHOLE POINT. A cold agent will raise a budget to make a
 * test pass, invent a metric to fill a field, or write a file with a UTF-8 BOM
 * that breaks JSON.parse — not from carelessness, but because none of those
 * rules are visible in the code. `docs/delegation.md` is read at run time and
 * sent verbatim, so the rules can never drift from what delegates are told.
 *
 * Usage:
 *   pnpm delegate "refactor X"                  route it, then run it
 *   pnpm delegate --to codex "..."              force an owner
 *   pnpm delegate --to antigravity "..."        prepare a brief and open the IDE
 *   pnpm delegate --review                      second-opinion review of this branch
 *   pnpm delegate --dry-run "..."               show the routing and the brief only
 *   pnpm delegate --full "..."                  verify with the whole verify:all chain
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const RUNS_DIR = join(repoRoot, ".delegate");
const POLICY = join(repoRoot, "docs", "delegation.md");

type Owner = "in-house" | "codex" | "antigravity";

// ---------------------------------------------------------------------------
// Locating the agents
// ---------------------------------------------------------------------------

/**
 * Codex installs under a content-hashed directory that changes on every update,
 * so the path is resolved at run time. Hard-coding the hash would work exactly
 * until the next release.
 */
function findCodex(): string | null {
  const local = process.env["LOCALAPPDATA"];
  if (local !== undefined) {
    const binRoot = join(local, "OpenAI", "Codex", "bin");
    if (existsSync(binRoot)) {
      const candidates = readdirSync(binRoot)
        .map((entry) => join(binRoot, entry, "codex.exe"))
        .filter((path) => existsSync(path))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      const newest = candidates[0];
      if (newest !== undefined) return newest;
    }
  }
  // Falls back to PATH, which is where a non-Windows or manual install lands.
  const probe = spawnSync("codex", ["--version"], { encoding: "utf8", shell: true });
  return probe.status === 0 ? "codex" : null;
}

/** Codex's Windows sandbox runs as this managed local account. */
const SANDBOX_ACCOUNT = "CodexSandboxOffline";

/**
 * Is Codex's sandbox actually usable?
 *
 * On Windows every file read, every `apply_patch` and every shell command is
 * routed through a helper that impersonates a managed local account. If that
 * account was never provisioned, the helper fails with
 * `helper_sid_resolve_failed` and NOTHING works — not writes, not reads, not
 * even under `--sandbox read-only`.
 *
 * That failure is expensive to discover the slow way. Left unchecked, a run
 * flails for tens of thousands of tokens, searches the public web for the
 * repository it cannot read, and then answers from guesswork rather than
 * reporting that it was blocked. Checking for the account first costs
 * milliseconds and turns all of that into one actionable sentence.
 */
function codexSandboxReady(): boolean {
  if (process.platform !== "win32") return true;
  const probe = spawnSync("net", ["user", SANDBOX_ACCOUNT], { encoding: "utf8" });
  return probe.status === 0;
}

function sandboxSetupPath(): string | null {
  const local = process.env["LOCALAPPDATA"];
  if (local === undefined) return null;
  const binRoot = join(local, "OpenAI", "Codex", "bin");
  if (!existsSync(binRoot)) return null;
  const found = readdirSync(binRoot)
    .map((entry) => join(binRoot, entry, "codex-windows-sandbox-setup.exe"))
    .filter((path) => existsSync(path))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return found[0] ?? null;
}

function findAntigravity(): string | null {
  const local = process.env["LOCALAPPDATA"];
  if (local === undefined) return null;
  const exe = join(local, "Programs", "antigravity", "Antigravity.exe");
  return existsSync(exe) ? exe : null;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Patterns that mean "do not delegate this".
 *
 * These are the areas where work fails by producing something plausible and
 * untrue, which no test catches. The heuristic is deliberately eager: a false
 * "keep in-house" costs a delegation, while a false "safe to delegate" costs a
 * fabricated claim in a portfolio whose entire premise is that its claims are
 * checkable.
 */
// Labelled rather than stringified: `String(/\bbudget/i)` prints the delimiters
// and flags, and stripping those characters also eats letters out of the word.
const KEEP_IN_HOUSE: readonly { label: string; pattern: RegExp }[] = [
  { label: "budgets", pattern: /\bbudget/i },
  { label: "ADRs", pattern: /\badr\b/i },
  { label: "the schema", pattern: /\bschema\b/i },
  { label: "contracts", pattern: /\bcontract/i },
  { label: "evidence", pattern: /\bevidence\b/i },
  { label: "metrics", pattern: /\bmetric/i },
  { label: "claims", pattern: /\bclaim/i },
  { label: "proof levels", pattern: /\bproof level\b/i },
  { label: "phase planning", pattern: /\bphase\b/i },
  { label: "planning", pattern: /\bplan\b/i },
  { label: "the PRD", pattern: /\bprd\b/i },
];

const VISUAL: readonly RegExp[] = [
  /\bui\b/i,
  /\bvisual/i,
  /\blayout\b/i,
  /\bdesign\b/i,
  /\bcss\b/i,
  /\bstyling\b/i,
];

function route(task: string): { owner: Owner; because: string } {
  const blocked = KEEP_IN_HOUSE.find((entry) => entry.pattern.test(task));
  if (blocked !== undefined) {
    return {
      owner: "in-house",
      because: `touches ${blocked.label} — a wrong answer there looks plausible, and no test catches it`,
    };
  }
  if (VISUAL.some((pattern) => pattern.test(task))) {
    return { owner: "antigravity", because: "judged by eye, so a human is in the loop anyway" };
  }
  return { owner: "codex", because: "bounded and machine-checkable" };
}

// ---------------------------------------------------------------------------
// The brief
// ---------------------------------------------------------------------------

function git(args: string[]): string {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function buildBrief(task: string): string {
  const policy = existsSync(POLICY)
    ? readFileSync(POLICY, "utf8")
    : "docs/delegation.md is missing; proceed with extreme caution.";

  // Only the part of the policy meant for the agent. Everything above the
  // marker is routing guidance for the dispatcher, not instructions.
  const marker = "# House rules for delegated work";
  const rules = policy.includes(marker) ? policy.slice(policy.indexOf(marker)) : policy;

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const recent = git(["log", "--oneline", "-5"]);
  const dirty = git(["status", "--porcelain"]);

  return [
    "# Task",
    "",
    task,
    "",
    "---",
    "",
    "# Project context",
    "",
    "Project Atlas — a static-first, evidence-driven engineering portfolio.",
    "Its premise is that every claim it makes is checkable, so correctness and",
    "honesty matter more here than speed.",
    "",
    `Repository: ${repoRoot}`,
    `Branch: ${branch}`,
    "",
    "Recent commits:",
    recent === ""
      ? "  (none)"
      : recent
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n"),
    "",
    dirty === ""
      ? "The working tree is clean."
      : `The working tree has uncommitted changes:\n${dirty
          .split("\n")
          .map((l) => `  ${l}`)
          .join("\n")}`,
    "",
    "---",
    "",
    rules,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

/**
 * Run an agent with the brief on **stdin** rather than as an argument.
 *
 * Passing a multi-line brief as argv fails: through a Windows shell it is split
 * on whitespace, so a brief beginning "# Task" arrives as a stray `Task`
 * argument and the command aborts. Quoting cannot fix this in general — the
 * brief contains newlines, quotes and backticks by design.
 *
 * `codex exec -` reads the prompt from stdin, which sidesteps shell parsing
 * entirely and stays correct no matter what the brief contains. `shell` is off
 * for an absolute path; it is only needed to resolve a bare name on PATH.
 */
function runWithBrief(command: string, args: string[], brief: string): number {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    input: brief,
    // stdin is a pipe so `input` reaches the agent; stdout and stderr are
    // inherited so its progress is visible live rather than buffered.
    stdio: ["pipe", "inherit", "inherit"],
    shell: !command.includes("\\") && !command.includes("/"),
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.status ?? 1;
}

function verify(full: boolean): boolean {
  // The fast gate by default. `verify:all` also builds the site and runs the
  // export suite, which is right before a merge and too slow for a loop.
  const steps = full
    ? [["pnpm", ["verify:all"]]]
    : [
        ["pnpm", ["typecheck"]],
        ["pnpm", ["lint"]],
        ["pnpm", ["test"]],
      ];

  for (const [command, args] of steps) {
    process.stdout.write(`\n--- ${command as string} ${(args as string[]).join(" ")}\n`);
    if (run(command as string, args as string[]) !== 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

function slug(task: string): string {
  return (
    task
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "task"
  );
}

function toCodex(task: string, brief: string, briefPath: string, full: boolean): number {
  const codex = findCodex();
  if (codex === null) {
    process.stderr.write(
      "Codex was not found. Looked under %LOCALAPPDATA%\\OpenAI\\Codex\\bin and on PATH.\n",
    );
    return 1;
  }

  if (!codexSandboxReady()) {
    const setup = sandboxSetupPath();
    process.stderr.write(
      [
        "",
        `Codex's sandbox is not provisioned: the local account ${SANDBOX_ACCOUNT} does not exist.`,
        "Every file read and write fails with helper_sid_resolve_failed until it does,",
        "in every sandbox mode — and Codex answers from guesswork rather than saying so.",
        "",
        "Fix it once, from an ELEVATED PowerShell (creates a managed local account):",
        setup === null ? "  codex doctor   # locate the sandbox setup helper" : `  & "${setup}"`,
        "",
        "Then re-run this command. `pnpm delegate --doctor` re-checks.",
        "",
      ].join("\n"),
    );
    return 1;
  }

  // A branch, always. Delegated work is reviewed before it reaches main, and
  // that is far easier to hold to when it was never on main to begin with.
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.startsWith("delegate/")) {
    const target = `delegate/${slug(task)}`;
    process.stdout.write(`Creating branch ${target}\n`);
    if (run("git", ["checkout", "-b", target]) !== 0) {
      process.stderr.write("Could not create the branch; commit or stash first.\n");
      return 1;
    }
  }

  const outPath = join(RUNS_DIR, `${Date.now()}-last-message.md`);
  process.stdout.write(`\nHanding off to Codex. Brief: ${briefPath}\n\n`);

  const status = runWithBrief(
    codex,
    [
      "exec",
      "--cd",
      repoRoot,
      // workspace-write, never --dangerously-bypass-approvals-and-sandbox: this
      // agent can edit the repo, and that is exactly why it stays sandboxed.
      "--sandbox",
      "workspace-write",
      "--output-last-message",
      outPath,
      // The prompt comes from stdin. See runWithBrief.
      "-",
    ],
    brief,
  );

  if (status !== 0) {
    process.stderr.write(`\nCodex exited ${status}. Nothing was verified.\n`);
    return status;
  }

  const changed = git(["status", "--porcelain"]);
  process.stdout.write(`\n=== Files touched ===\n${changed === "" ? "  (none)" : changed}\n`);
  if (existsSync(outPath)) {
    process.stdout.write(`\n=== Agent's report ===\n${readFileSync(outPath, "utf8")}\n`);
  }

  if (changed === "") {
    process.stdout.write("\nNothing changed, so there is nothing to verify.\n");
    return 0;
  }

  const passed = verify(full);
  process.stdout.write(
    passed
      ? "\nVerification passed. Review the diff, then merge the branch yourself.\n"
      : "\nVERIFICATION FAILED. The work is on the branch; nothing was committed.\n",
  );
  return passed ? 0 : 1;
}

function toAntigravity(brief: string, briefPath: string): number {
  const exe = findAntigravity();
  process.stdout.write(
    [
      "",
      "Antigravity has no CLI — it is an asar-packed Electron app with no bin shim,",
      "so it cannot be driven headlessly. The brief is ready to paste:",
      "",
      `  ${briefPath}`,
      "",
    ].join("\n"),
  );
  if (exe === null) {
    process.stdout.write("Antigravity was not found under %LOCALAPPDATA%\\Programs.\n");
    return 1;
  }
  process.stdout.write("Opening the workspace...\n");
  // spawn, not spawnSync: this launches a GUI, and the synchronous form would
  // block the dispatcher until the user closed the IDE. unref lets node exit
  // while the editor keeps running.
  spawn(exe, [repoRoot], { detached: true, stdio: "ignore" }).unref();
  return 0;
}

function reviewBranch(full: boolean): number {
  const codex = findCodex();
  if (codex === null) {
    process.stderr.write("Codex was not found.\n");
    return 1;
  }
  process.stdout.write("Running a second-opinion review of the current branch.\n\n");
  const status = run(codex, ["exec", "--cd", repoRoot, "--sandbox", "read-only", "review"]);
  // A review changes nothing, so there is nothing to verify afterwards.
  void full;
  return status;
}

// ---------------------------------------------------------------------------

function main(): number {
  const argv = process.argv.slice(2);
  const flag = (name: string): boolean => argv.includes(`--${name}`);
  const value = (name: string): string | null => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? null : (argv[index + 1] ?? null);
  };

  const full = flag("full");

  if (flag("doctor")) {
    const codex = findCodex();
    const antigravity = findAntigravity();
    const ready = codexSandboxReady();
    process.stdout.write(
      [
        "",
        `Codex binary      ${codex ?? "NOT FOUND"}`,
        `Codex sandbox     ${ready ? "ready" : `NOT PROVISIONED (${SANDBOX_ACCOUNT} missing)`}`,
        `Antigravity       ${antigravity ?? "NOT FOUND"} (GUI only — no CLI exists)`,
        "",
        ready
          ? "The Codex lane is usable."
          : `The Codex lane is blocked. From an elevated PowerShell:\n  & "${sandboxSetupPath() ?? "codex doctor"}"`,
        "",
      ].join("\n"),
    );
    return ready && codex !== null ? 0 : 1;
  }

  if (flag("review")) return reviewBranch(full);

  const task = argv.filter((arg, i) => !arg.startsWith("--") && argv[i - 1] !== "--to").join(" ");
  if (task.trim() === "") {
    process.stderr.write(
      [
        "Describe the task.",
        "",
        '  pnpm delegate "convert the row view to a table element"',
        '  pnpm delegate --to codex "..."',
        "  pnpm delegate --review",
        "",
      ].join("\n"),
    );
    return 1;
  }

  const forced = value("to");
  const decision = route(task);
  const owner: Owner = (forced as Owner | null) ?? decision.owner;

  process.stdout.write(
    `\nTask:  ${task}\nOwner: ${owner}${forced === null ? ` (${decision.because})` : " (forced)"}\n`,
  );

  if (owner === "in-house") {
    process.stdout.write(
      [
        "",
        "Kept in-house on purpose. This touches contracts, budgets, evidence or",
        "planning, where a wrong answer looks plausible and no test catches it.",
        "Override with --to codex if you are sure the work is bounded.",
        "",
      ].join("\n"),
    );
    return 0;
  }

  mkdirSync(RUNS_DIR, { recursive: true });
  const brief = buildBrief(task);
  const briefPath = join(RUNS_DIR, `${Date.now()}-${slug(task)}.md`);
  // UTF-8 without a BOM. writeFileSync defaults to that; the PowerShell
  // equivalents do not, which is the trap documented in CONTRIBUTING.
  writeFileSync(briefPath, brief, "utf8");

  if (flag("dry-run")) {
    process.stdout.write(`\nBrief written to ${briefPath}\n\n${brief}\n`);
    return 0;
  }

  return owner === "codex"
    ? toCodex(task, brief, briefPath, full)
    : toAntigravity(brief, briefPath);
}

process.exit(main());
