# ADR 0029 - The audit baseline is committed to the repository

- Status: accepted
- Date: 2026-08-29
- Phase: 2

## Context

PRD 5.1.3 requires the compiler to "produce an audit report listing additions,
removals, field changes, stale records, broken evidence, taxonomy changes, and
budget deltas". Every item on that list is a statement about a _difference_, so
the audit needs a previous state to compare against. The compiler had none.

Two validation rules were blocked on exactly this and had been carrying
coverage exemptions since Phase 0:

| Rule                    | What it asserts                                      |
| ----------------------- | ---------------------------------------------------- |
| `COR-ID-PERMANENCE-001` | A published `id` was removed or reassigned (PRD 8.3) |
| `COR-SLUG-REDIRECT-001` | A slug changed with no redirect (PRD 8.3 / 10.4)     |

Neither can be reached by an invalid fixture, because a single record is
consistent with itself. Both describe damage to links that already exist in the
world: a removed id orphans every bookmark and search result pointing at it, and
a moved slug does the same more quietly.

Three sources for a previous state were considered.

**The previous build's `manifest.json`.** Already written to
`apps/web/public/catalog/`, but `publishStage` overwrites it, and `public/` is
gitignored build output. A fresh clone and every CI runner start with nothing,
so the check would pass vacuously in precisely the environment meant to enforce
it.

**The deployed site.** Correct in principle — production is the state whose
links actually matter — but it makes the build depend on the network, which
PRD 5.1.4 confines to an explicit maintainer command, and makes an offline or
first-time build impossible.

**A committed snapshot.** Version-controlled, offline, reviewable in a diff.

## Decision

`content/catalog-baseline.json` holds a snapshot of the catalog: per record its
`id`, `slug`, `title`, `visibility`, `proofLevel` and a content fingerprint;
plus artifact sizes and every taxonomy term in use. `pnpm catalog:audit` diffs
the current catalog against it and fails on the two rules above.

The snapshot is identity plus the fields whose change matters — not a copy of
the catalog. A full copy would double the size of every content diff and make
the audit's own output unreadable.

Updating the baseline is a **separate, explicit command**
(`pnpm catalog:audit --update`) whose result is committed. If the audit updated
the baseline itself it could never fail: the run meant to catch a deleted
published id would record that deletion as the new normal. Making the update a
reviewed commit is what turns the check into a decision someone made rather than
a side effect.

`content/redirects.v1.json` maps an old slug to its current one. Adding an entry
is how a rename is deliberately accepted.

## Consequences

**Two exemptions retired.** `COR-ID-PERMANENCE-001` and
`COR-SLUG-REDIRECT-001` are observed firing in `tests/catalog/audit.test.ts`,
and their entries in `COVERAGE_EXEMPTIONS` now name that file instead of
deferring to Phase 5.

**`GEN-FIELD-001` is not retired.** It was grouped with the other two, but the
baseline does not reach it: the compiler recomputes `contentHash`, enrichment
and ordinals from source, so a hand-edited value is silently overwritten rather
than compared. Detecting it needs the compiler to read the authored value
before discarding it. The exemption now says that instead of "Phase 5".

**A renamed slug costs a redirect entry.** Intended. The alternative is
breaking every existing deep link silently.

**The baseline can drift from reality.** It records what was last committed, not
what is deployed. Should the two diverge, the deployed site is the authority and
the baseline is wrong. Re-running `--update` on the deployed commit is the fix.

**The audit never trusts its own fingerprint alone.** The first implementation
returned early when a record's hash matched the baseline's, which made the whole
report depend on one 16-character string; a hand-edited baseline reported "no
change" over a renamed slug. Tracked fields are now compared directly and the
fingerprint only catches changes in fields nothing tracks by name. The
regression is pinned by a test.

## Notes

Staleness (PRD 14) is reported but raises no issue. No rule in the registry
covers an aged `lastVerified`, and borrowing an unrelated rule id to make the
output look complete would misreport it. The response to a stale record — re-
verify, or demote the proof level — is a judgement the compiler cannot make.
