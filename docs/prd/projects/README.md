# Project requirements documents

One document per flagship project, named `<ID>-<product>.md`. These specify the five projects in
the GitHub pin rotation recorded in `content/editorial/flagship-rotation.v1.json`.

## These are deliberately not a template

Every other document set in this repository follows a fixed shape — ADRs share a template because
PRD 4.1 requires the same six fields from each of them. **These do not, and that is the decision,
not an oversight.** A governed retrieval platform, an event-driven marketplace, a declarative SRE
environment, a streaming data platform and a mobile product have genuinely different natural
shapes, and forcing one skeleton across them produces five documents that each describe their
subject slightly badly.

So the headings differ. DST-01 has a section on Saga compensations and what happens when a
compensation itself fails; OPS-01 has one on how the exhibit stays affordable; DE-01 has one on why
it runs two processing engines. None of those transplant.

Two things are common, because they are properties of the archive rather than of any project:

- **Every number is a target or a budget with a stated measurement method, never a result.** PRD
  0.10 and 12.2 forbid inventing metrics, performance results, repository history or external
  validation. Four of these five projects have never been built; the documents say so in their
  opening section and hold to it.
- **Each ends with what would move the project from proof level `code` to `measured`** — the
  specific artefacts and measurements required. That ladder is the archive's currency.

The manifest wins over any of these documents (PRD 5.1.1). Where a document proposes filling a
manifest field that is currently empty, it flags the proposal explicitly rather than implying the
field is already populated.

## The documents

| Project | Product                                          | Repository          | Track                                  | Status               |
| ------- | ------------------------------------------------ | ------------------- | -------------------------------------- | -------------------- |
| RAG-01  | [AtlasOps](RAG-01-atlasops.md)                   | `atlasops`          | 14 — retrieval, search, production RAG | planned · `code`     |
| DST-01  | [CommerceFlow](DST-01-commerceflow.md)           | `commerceflow`      | 5 — distributed and event-driven       | planned · `code`     |
| FS-01   | [Berea Rides](FS-01-berea-rides.md)              | `berea-rides`       | 10 — full-stack commercial product     | in-progress · `code` |
| OPS-01  | [Reliability Forge](OPS-01-reliability-forge.md) | `reliability-forge` | 8 — cloud, DevOps, platform, SRE       | planned · `code`     |
| DE-01   | [SignalLake](DE-01-signallake.md)                | `signallake`        | 11 — data engineering and analytics    | planned · `code`     |

FS-01 is the only one describing a system that exists, so it is the only one that reads as a
record rather than a specification.

## Repository layout is the part to read first

Each document specifies a concrete module tree for its product, with a table stating what every
module owns, what it may import, and **what it must never import** — enforced mechanically in CI
rather than by convention, in the same way this repository enforces its own rules.

The shared problem, and the reason the layouts are more structured than a single application would
need: four of these five repositories host a keystone **plus fourteen focused exhibits** from the
same track. The organising constraint is that an exhibit must reuse the keystone's machinery
without coupling to the keystone's application layer or to any other exhibit. The recurring answer
is that exhibits are leaves — nothing imports an exhibit — so any one can be deleted, rewritten or
published alone.

`berea-rides` is the exception: Track 10's strategy is "one repository per serious product", and it
is a single product. Its layout solves a different problem — isolating the regulated matching rule
as a pure, dependency-free package so it can be evaluated against a fixture corpus, which is the
specific thing standing between that project and a higher proof level.

## Known gap: repository names are not structured data

The repository each track maps to is recorded only as prose in
`docs/prd/portfolio-project-selection.md`, as a bolded "Repository" line under each track heading.
No project manifest carries a `repository` field — checked across all 240 — and
`content/taxonomy/tracks.v1.json` is a closed vocabulary of track terms that does not carry them
either.

That was tolerable while the repository name was a note. It is now load-bearing for five
specifications, which makes it the same class of problem the archive keeps finding elsewhere: a
fact that matters, recorded only in prose, with nothing to keep it honest. Promoting it to the
track vocabulary or to the project schema would make it checkable. That is a schema change and has
not been made.
