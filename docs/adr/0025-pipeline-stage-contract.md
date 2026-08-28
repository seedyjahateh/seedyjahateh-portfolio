# ADR 0025 - Pipeline stage contract and a deterministic build clock

- Status: accepted
- Date: 2026-08-28
- Phase: 2

## Context

PRD 5.1.2 requires that "every stage must be a pure or explicitly side-effecting
function with structured logs, duration metrics, input/output counts, and a
stable error code", and PRD 5.1.3 requires byte-identical artifacts from
identical inputs.

Those two sentences interact in a way that is easy to miss. `manifest.builtAt`
is a timestamp inside an artifact, so a build that reads the wall clock produces
different bytes every run - and rule BLD-DETERMINISM-001 fires against the build
system itself rather than against any real defect.

## Decision

A `Stage<In, Out>` interface with a name, a declared `effects` list, and a `run`
function. The runner times every stage, records its output count, and collects
issues carrying registry rule ids.

Declared effects do real work. `--offline` refuses to run any stage declaring
`network`, which is how CI guarantees enrichment cannot reach GitHub. It also
means "which parts of this build touch the outside world" is answerable by
reading the stage table - currently only `discover` (read) and `publish`
(write); everything between them is pure.

The build clock is **injected, never ambient**. Production derives it from the
git commit timestamp: a property of the input rather than of when the build ran.
Tests pin it to a literal. `Date.now()` appears nowhere in the pipeline.

Ordinals follow the same logic. PRD 5.3.2 needs "a stable zero-based ordinal for
the current build", and that ordinal indexes every bitset, so it is assigned once
from a total deterministic sort (curated priority, then id) and never recomputed.

## Consequences

Easier: the PRD 5.1.6 SLO report is a by-product of running the pipeline rather
than a separate measurement that can drift from it. Determinism is verifiable in
one command.

Harder: stages cannot casually read the clock or the network, and adding either
means declaring it.

## Compressed cost

None. Build-time only.

## Fallback

None needed.

## Removal path

Call the stage functions directly. Loses timings, effect enforcement, and the
SLO report.

## Revisit trigger

If a stage genuinely needs wall-clock time in an artifact, that artifact has to
be excluded from the determinism comparison - and that exclusion needs its own
decision, not a quiet exception.
