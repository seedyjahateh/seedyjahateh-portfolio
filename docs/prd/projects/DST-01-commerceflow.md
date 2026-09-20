# DST-01 — CommerceFlow Event-Driven Marketplace

**Project ID:** DST-01
**Product:** CommerceFlow
**Track:** 5 — Distributed and event-driven systems
**Repository:** `commerceflow` (monorepo; hosts DST-01 through DST-15)
**Tier:** keystone · **Primary roles:** Backend Engineer, AI infrastructure
**Manifest:** `content/projects/DST-01.json` · **Status:** `planned` · **Proof level:** `code`
**Document type:** project requirements + architecture contract
**Document status:** specification. Nothing in this document has been built, run, or measured.

---

## 0. How to read this document, and what it may not claim

The manifest at `content/projects/DST-01.json` is authoritative. Platform PRD 5.1.1 states that a
human-authored manifest controls titles, claims, role mapping, evidence, ordering, and visibility,
and that no other source may overwrite a curated field. Where this document proposes a value that
the manifest does not yet carry, the proposal is marked and the manifest still wins until a human
edits it. Section 18 lists every such divergence in one place.

The manifest currently records `status: "planned"`, `proofLevel: "code"`, an empty `stack`, an empty
`metrics` array, an empty `evidence` array, a null `content.problem`, and null values for every date.
That is an accurate record: this system does not exist. Platform PRD 0.10 ("truth outranks
spectacle") and 12.2 ("no workstream may invent project metrics, repository history, user counts,
revenue, performance results, or external validation") therefore govern every number below.

Consequently, **every quantity in this document is a target or a budget, never a result.** Each one
is stated with the measurement method that would produce it and the artefact that would carry it.
None of them has been observed. A reader who wants to know what CommerceFlow has achieved should
read section 17, which says: nothing yet, and here is precisely what would have to exist before the
proof level may move.

## 1. The problem, and who has it

The manifest's `content.problem` field is `null`. **This document specifies it**; section 18 records
that as a proposed manifest change rather than an existing fact.

The proposed problem statement:

> A marketplace order is not one transaction. It is a sequence of state changes across catalog,
> pricing, inventory, payment, fulfillment, and support — owned by different teams, backed by
> different databases, and reachable only over a network that drops, duplicates, reorders, and
> delays. There is no distributed transaction available to hold them together. The engineering
> problem is to make that sequence produce a correct business outcome anyway: never ship an
> unauthorized order, never sell stock twice, never charge twice for one checkout, and never leave
> an order in a state that no human or process will resolve.

Three audiences have this problem in three different shapes.

**The hiring engineer reviewing the portfolio** has a screening problem. Nearly every backend
candidate claims Kafka on a résumé. Very few can say what happens when the consumer crashes between
the side effect and the offset commit, or what their system does when a compensating action itself
fails. The portfolio's stated job for a Backend Engineer lead project (`flagship-rotation.v1.json`,
`backend-engineer.firstScreenMustProve`) is to prove that the engineer "reason[s] about concurrency,
data correctness, failure, scale, and operations." A CRUD storefront cannot prove that. A system
that can be deliberately broken in front of the reviewer, while a suite of invariants is asserted
continuously, can.

**The engineer building commerce systems** has a correctness problem that is usually discovered in
production. Duplicate delivery is the default in every at-least-once messaging system, and the
default response — "we'll dedupe later" — becomes a double charge. Partial saga failure is the
default whenever a network call can time out, and the default response — retry the whole checkout —
becomes double-reserved inventory. These failures are cheap to demonstrate in a lab and expensive to
discover live.

**The reviewer who does not trust demos** has an evidence problem. A happy-path screencast proves
nothing about failure behaviour, because the failures are precisely what a screencast omits. The
answer is not a better screencast; it is a reproducible harness that injects the failure, records
what happened, and asserts the invariants — so the artefact is a machine-checked report, not a
narrative.

CommerceFlow is built to be the answer to all three: one coherent marketplace, complete enough that
its failure modes are real, and instrumented so that its behaviour under those failures is
observable and assertable rather than described.

## 2. What this exhibit must make a reviewer able to conclude

The design target is that a reviewer who spends fifteen minutes can conclude, from artefacts rather
than prose:

1. The service boundaries were chosen for a reason that is written down, and the reason survives
   contact with the data (no service reads another's tables).
2. The event contract is enforced by a machine, not by a convention. An incompatible schema change
   fails CI, and the author can see exactly which consumer it would have broken.
3. The system does not claim exactly-once delivery. It claims at-least-once delivery with
   effectively-once _processing_, and it names the two mechanisms that make the difference real: the
   transactional outbox and idempotent consumers.
4. The order Saga's compensations are enumerated, including the case where a compensation fails, and
   the system has a defined, non-silent terminal state for that case.
5. Under injected failure — broker partition, consumer kill, duplicate replay, ambiguous payment
   timeout, failing compensation — the business invariants hold, and the reviewer can watch them
   being asserted.

Everything in the repository layout, the CI design, and the demo harness exists to serve those five
conclusions. Anything that does not serve them is out of scope.

## 3. Non-goals, stated precisely

Non-goals are load-bearing here, because an event-driven marketplace expands without limit unless
boundaries are declared and defended.

### 3.1 Checkout is simulated. No real money moves.

"Checkout simulation" is the manifest's own word and it means something specific and narrow:

- **No payment service provider is integrated.** No Stripe, Adyen, Braintree, PayPal, or bank
  connection exists in any environment, including a sandbox one. There is no merchant account, no
  API key for a payment processor, and no code path that could acquire one.
- **A `payment-sim` service stands in for the PSP.** It implements a realistic _protocol_ —
  authorization, capture, void, refund, with an idempotency key and an ambiguous-timeout mode —
  because the protocol shape is what the Saga must be correct against. It implements no _settlement_.
  Balances are internal bookkeeping rows.
- **No cardholder data is accepted, stored, transmitted, or logged**, in any field, in any
  environment. The checkout form collects a payment-method token that `payment-sim` mints; no PAN,
  CVV, expiry, or billing identifier ever enters the system. There is no PCI scope to reason about
  because there is no cardholder data.
- **The storefront states that checkout is a simulation** on the payment step and on the order
  confirmation, in visible text, not a tooltip.

Why draw the line there. Integrating a real PSP would add sandbox-credential management, webhook
signature verification, and settlement reconciliation — all genuinely interesting, and all of which
would consume the effort that the Saga, the outbox, and the recovery demonstration need. It would
also create a permanent obligation to keep credentials rotated in a portfolio project that may sit
untouched for a year, and a permanent risk that a demo environment accepts a real card number from a
curious visitor. The distributed-systems content — orchestration, compensation, idempotency,
ambiguous outcomes — is entirely preserved by a simulator, because the Saga only ever sees a network
call that may succeed, fail, or time out. The commerce-integration content is lost, and that loss is
accepted. Where real payment-protocol depth is wanted, it lives in DST-02 (double-entry ledger),
which models authorization/capture/refund states and reconciliation without moving money either.

### 3.2 Further non-goals

- **No multi-tenancy.** One marketplace, many sellers as a data concept, but one operator. Tenant
  isolation as an engineering problem belongs to SEC-01 and DB-12.
- **No real user accounts at scale.** Authentication exists to attach an order to an identity and to
  gate the support and admin surfaces. Session security, MFA, and abuse resistance belong to Track 6.
- **No production hosting commitment.** The target deployment is a reproducible local compose stack
  plus an optional ephemeral cloud environment for the demo. A continuously running public
  marketplace is not a goal, and the cost of one is not justified by what it would prove.
- **No recommendation model training.** Search relevance and support triage use the retrieval and
  ranking surfaces described in section 5.9; model development belongs to Tracks 9–12.
- **No mobile applications.** The storefront is one responsive web client.
- **Not a Kafka tutorial.** The repository does not re-explain partitions and consumer groups. It
  assumes the reader knows them and shows what is hard: the boundary between the broker's guarantees
  and the database's.
- **No claim of production traffic.** All load is synthetic and must be labelled `synthetic: true` in
  every metric record, per platform PRD 8.3.

## 4. Bounded contexts, and why the split falls where it does

The split is driven by three questions asked of every candidate boundary: does it own a distinct
transactional invariant, does it have a distinct consistency requirement, and does it have a distinct
failure mode? A boundary that answers "no" to all three is a package, not a service.

| Context           | Language   | Owns (invariant)                                                   | Consistency requirement                         | Distinct failure mode                           |
| ----------------- | ---------- | ------------------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------- |
| Catalog           | Python     | Product, variant, and seller records; the canonical SKU identity   | Strong within a product; eventual to readers    | Stale projection after a bulk edit              |
| Search            | Python     | The query-time index and relevance configuration                   | Eventual; bounded staleness is acceptable       | Index divergence from catalog; rebuild cost     |
| Pricing           | Python     | Price lists, promotions, and the price quoted at cart time         | Strong at quote time; quote is immutable after  | A promotion expiring between quote and checkout |
| Cart and Checkout | Java       | The in-flight basket and the checkout intent                       | Strong per cart; no cross-cart invariant        | Abandoned or duplicated checkout submission     |
| Orders            | Java       | The order aggregate and the Saga's state machine                   | Strong per order; the Saga log is the record    | Partial completion; stuck compensation          |
| Inventory         | Java       | Available, reserved, and committed stock per SKU per location      | Strong per SKU; must never go negative          | Oversell; orphaned reservation                  |
| Payment (sim)     | Java       | Authorization, capture, void, and refund state per order           | Strong per authorization                        | Ambiguous outcome on timeout                    |
| Fulfillment       | Java       | Shipment, pick/pack state, and the carrier handoff                 | Strong per shipment; forward-only after handoff | Handoff that cannot be recalled                 |
| Support           | Python     | Cases, their timelines, and the read projections that serve agents | Eventual; lag must be visible, not hidden       | Projection rebuild; lag masquerading as loss    |
| Analytics         | Python     | Windowed aggregates over the event log                             | Eventual; late and out-of-order events expected | Late data silently dropped from a closed window |
| Notifications     | Python     | Outbound message intent and per-recipient dedupe                   | At-least-once intent, effectively-once send     | Duplicate send across retries                   |
| Storefront        | TypeScript | Presentation and client session only                               | None; it owns no business state                 | A degraded upstream rendered as a broken page   |

Four boundary decisions deserve their reasons in the open, because each of them could plausibly have
gone the other way.

**Inventory is separate from Orders.** The tempting design folds reservation into the order
aggregate, and it is simpler — one transaction, no Saga step, no compensation. It is rejected
because the inventory invariant (`available >= 0` per SKU per location) is contended by writers other
than checkout: seller restocks, returns, warehouse corrections, and cancellations. Making Orders the
owner of that invariant means every one of those writers must go through the order service, which is
a boundary the domain does not have. The cost of the split is the entire reservation/release
compensation pair, which is precisely the content this exhibit exists to show.

**Cart and Checkout are separate from Orders.** A cart is high-churn, low-value, tolerant of loss,
and is written on nearly every page interaction. An order is low-churn, high-value, and intolerant of
loss. Putting them in one service means the order store absorbs cart write volume and the cart's
looser durability requirements leak into the order's stricter ones. The split lets the cart store be
chosen for throughput and the order store for durability. The cost is one more network hop on the
checkout path and one more place where a checkout can be submitted twice — which is why the
idempotency key enters at exactly this boundary (section 10.4).

**Pricing is separate from Catalog** even though both are Python and both are read-mostly. The
reason is temporal: a price is quoted at a moment and that quote must be immutable for the life of
the checkout, while a catalog description has no such property. Folding them together would blur the
distinction between "what this product is" and "what it costs right now, and what it cost when the
customer agreed." The cost is an extra call on the cart path; the benefit is that price changes and
promotion expiry during checkout become a designed case rather than an accident.

**Notifications is separate from everything.** It exists mostly as a place where the effectively-once
problem is _not_ solvable by a database constraint, because the side effect is external and
unretractable. It is included deliberately as the honest counterexample: section 10.6 states what
the system can and cannot promise about a sent message.

## 5. Why both Python and Java

The manifest's summary commits to "Python and Java services." A polyglot split is a real cost —
two toolchains, two dependency ecosystems, two serialization libraries, doubled CI — so it needs a
reason beyond demonstrating that both can be written.

The reason is that the two halves of the system have genuinely different pressures.

The **transactional core** — Orders, Inventory, Payment, Fulfillment, Cart — is where the
correctness content lives. It wants a mature transactional story, a first-class Kafka client with
transactional producer support, static types that make an exhaustive state machine checkable at
compile time, and a Kafka Streams runtime for stateful processing. Java with Spring Boot is chosen
for that: `@Transactional` semantics that are explicit about propagation, records and sealed
interfaces for Saga state, and the reference implementation of the Kafka transactional APIs. The
tradeoff is verbosity and slower iteration.

The **data and read-side** — Catalog, Search, Support, Analytics, Notifications — is where iteration
speed and the retrieval/relevance work matter more than transaction semantics. Python with FastAPI is
chosen for that, and it is also where the "AI infrastructure" role in the Track 5 selection entry
becomes concrete: relevance tuning, support-case triage, and the feature/aggregate pipelines are
Python-native work.

The accepted cost: a schema change touches both codegen pipelines, local setup requires both
toolchains, and there is a permanent risk that a platform utility gets written well in one language
and badly in the other. Section 7.3 is the mitigation for the first cost; the `platform/` parity
rule in section 7.2 is the mitigation for the third. The second is not mitigated — a contributor
needs both a JDK and a Python toolchain, and the repository says so in its first README paragraph
rather than pretending otherwise.

## 6. What lives in this repository besides DST-01

`portfolio-project-selection.md` assigns all fifteen Track 5 entries to the `commerceflow`
repository. DST-01 is the keystone: the integrated product. DST-02 through DST-15 are focused
exhibits, each a self-contained deep dive on one mechanism that the keystone uses at integration
depth but cannot examine exhaustively without becoming unreadable.

| Exhibit | Subject                              | Relationship to the keystone                                      |
| ------- | ------------------------------------ | ----------------------------------------------------------------- |
| DST-02  | Double-entry payment ledger          | Deepens the bookkeeping behind `payment-sim`                      |
| DST-03  | Outbox and CDC reference             | Isolates and crash-tests the mechanism of section 10.2            |
| DST-04  | Reliable webhook ingestion gateway   | Isolates deduplication, ordering, and poison-event quarantine     |
| DST-05  | Real-time marketplace aggregator     | Deepens the Analytics context's windowing and late-data handling  |
| DST-06  | Priority work queue                  | Alternative transport; contrasts RabbitMQ semantics with Kafka's  |
| DST-07  | Horizontally scaled chat service     | Independent; shares the fan-out and presence problem shape        |
| DST-08  | Preference-aware notification system | Deepens the Notifications context and its duplicate-suppression   |
| DST-09  | Durable workflow engine              | Generalizes the Saga of section 9 into a reusable engine          |
| DST-10  | Distributed scheduler                | Supplies lease/leader semantics for timed Saga steps              |
| DST-11  | Leader election and membership lab   | Isolates the failure detection the scheduler depends on           |
| DST-12  | Replicated key-value store with Raft | Independent; consensus from first principles                      |
| DST-13  | CQRS customer support platform       | Deepens the Support context's projections and lag measurement     |
| DST-14  | Streaming risk signal pipeline       | Consumes the keystone's event log as a realistic input            |
| DST-15  | Multi-region configuration service   | Supplies the flag semantics the failure-injection harness toggles |

The dependency rule between them is one-directional and enforced (section 7.2): an exhibit may
depend on `contracts/` and `platform/`, and it may be _read_ by a keystone service's documentation,
but **no keystone service may import from `exhibits/`**. When an exhibit produces a mechanism the
keystone needs, the mechanism is promoted into `platform/` by a PR that moves it; the exhibit keeps
only its lab harness and its measurements. This prevents the common monorepo decay in which a
"demo" directory becomes a production dependency that nobody dares to delete.

## 7. Repository layout

### 7.1 The tree

```text
commerceflow/
├── contracts/                     # the only cross-service source of truth
│   ├── events/                    # Avro schemas, one directory per topic
│   │   ├── commerce.catalog.v1/
│   │   ├── commerce.pricing.v1/
│   │   ├── commerce.orders.v1/
│   │   │   ├── OrderSubmitted.avsc
│   │   │   ├── OrderConfirmed.avsc
│   │   │   ├── OrderCancelled.avsc
│   │   │   └── SagaStepFailed.avsc
│   │   ├── commerce.inventory.v1/
│   │   ├── commerce.payment.v1/
│   │   ├── commerce.fulfillment.v1/
│   │   ├── commerce.support.v1/
│   │   └── envelope/EventEnvelope.avsc
│   ├── commands/                  # point-to-point request schemas (Saga steps)
│   ├── openapi/                   # synchronous HTTP contracts, one file per service
│   ├── registry/
│   │   ├── subjects.yaml          # subject → schema file → compatibility mode → owner
│   │   ├── consumers.yaml         # which service consumes which subject (drives blast radius)
│   │   └── baseline/              # frozen registry state, seeds the CI registry container
│   └── codegen/
│       ├── java.gradle.kts
│       ├── python.py
│       └── typescript.ts
├── generated/                     # committed, never hand-edited, CI asserts clean regeneration
│   ├── java/com/commerceflow/events/
│   ├── python/commerceflow_events/
│   └── typescript/events/
├── platform/                      # shared mechanism, no domain knowledge
│   ├── java/
│   │   ├── outbox/                # outbox table DDL, writer, relay client
│   │   ├── idempotency/           # processed-event store, consumer wrapper
│   │   ├── serde/                 # the only place a Kafka payload is deserialized
│   │   ├── saga/                  # state machine runtime, compensation dispatcher
│   │   └── observability/         # tracing, metrics, structured logs, correlation ids
│   ├── python/
│   │   ├── outbox/
│   │   ├── idempotency/
│   │   ├── serde/
│   │   └── observability/
│   └── testing/
│       ├── java-fixtures/
│       ├── python-fixtures/
│       └── contract-tests/        # runs the same corpus against both serde implementations
├── services/
│   ├── java/
│   │   ├── order-orchestrator/
│   │   ├── cart-checkout/
│   │   ├── inventory/
│   │   ├── payment-sim/
│   │   └── fulfillment/
│   └── python/
│       ├── catalog/
│       ├── pricing/
│       ├── search/
│       ├── support/
│       ├── analytics/
│       └── notifications/
├── storefront/                    # Next.js; talks HTTP only, never Kafka
│   ├── app/
│   ├── lib/api/                   # generated from contracts/openapi
│   └── e2e/
├── exhibits/                      # DST-02 .. DST-15, one directory each
│   ├── dst-02-payment-ledger/
│   ├── dst-03-outbox-cdc/
│   └── ...
├── ops/
│   ├── compose/                   # the reproducible local stack
│   ├── failure/                   # scenario definitions for section 12
│   │   ├── scenarios/*.yaml
│   │   └── injectors/             # toxiproxy, container kill, clock skew, fault flags
│   └── invariants/                # the assertion suite run during and after every scenario
├── evidence/                      # generated reports; the only thing the portfolio links to
│   └── .gitignore                 # raw runs ignored; published reports committed explicitly
├── docs/
│   ├── adr/
│   ├── runbooks/
│   └── diagrams/
└── tools/
    ├── lint/                      # ArchUnit rules, import-linter config, dependency-cruiser
    └── ci/
```

### 7.2 Module contracts

Each row states what a module owns, what it may depend on, and what it must never import. The "must
never" column is the enforceable one; `tools/lint/` contains a rule for each entry and CI fails the
PR rather than a reviewer catching it.

| Module                   | Owns                                                                 | May depend on                                            | Must never import                                                                                |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `contracts/`             | Event, command, and HTTP schemas; subject registry; ownership map    | Nothing. It has no code dependencies at all.             | Any service, platform, exhibit, or generated code. A schema that imports code is a design error. |
| `generated/`             | Language bindings mechanically derived from `contracts/`             | Its language's Avro runtime only                         | Anything hand-written. It is an output, not a place to add a helper.                             |
| `platform/*/serde`       | Envelope encode/decode; the registry client; the DLQ envelope        | `generated/`, the Avro runtime                           | Any `services/` package; any domain type                                                         |
| `platform/*/outbox`      | Outbox table schema, transactional writer, relay contract            | `platform/*/serde`, a SQL driver                         | Any `services/` package; any Kafka consumer API                                                  |
| `platform/*/idempotency` | Processed-event store and the consumer wrapper                       | `platform/*/serde`, a SQL driver                         | Any `services/` package; any domain type                                                         |
| `platform/java/saga`     | Saga state machine runtime and compensation dispatch                 | `platform/java/{serde,outbox,idempotency,observability}` | Any `services/` package. It knows "step" and "compensation", never "payment".                    |
| `platform/testing`       | Cross-language fixture corpus and the serde parity suite             | `generated/`, both `platform` trees                      | Any `services/` package                                                                          |
| `services/java/*`        | One bounded context each: its schema, its transactions, its handlers | `generated/`, `platform/java/*`, its own module only     | Another service's package; another service's database; `exhibits/`; `storefront/`                |
| `services/python/*`      | One bounded context each                                             | `generated/`, `platform/python/*`, its own module only   | Another service's package; another service's database; `exhibits/`; `storefront/`                |
| `storefront/`            | Presentation, client session, accessibility, performance budgets     | `generated/typescript` (types only), `contracts/openapi` | Any Kafka client; any service source; any database driver                                        |
| `exhibits/*`             | One focused demonstration each, with its own harness and report      | `contracts/`, `platform/*`, its own module               | Another exhibit; any `services/` package; `storefront/`                                          |
| `ops/failure`            | Scenario definitions and fault injectors                             | Container/proxy APIs, `ops/invariants`                   | Any service source. It breaks the system from outside, never from inside.                        |
| `ops/invariants`         | The assertion suite: the definition of "still correct"               | Service _HTTP read APIs_ and the event log               | Any service's database or internal package. It must verify from outside.                         |
| `evidence/`              | Published, committed reports referenced by the portfolio manifest    | Nothing                                                  | Everything. It is an output directory.                                                           |

Two rules in that table carry most of the weight.

**No service may read another service's database.** This is the boundary that decays first in every
monorepo, because reading a table is always easier than adding an endpoint or a topic. It is enforced
by giving each service its own database user with grants only on its own schema, by asserting in CI
that no service's configuration references another service's connection string, and by a lint rule
forbidding cross-service package imports. The tradeoff is real: some read paths that would be a JOIN
become an event-fed projection with its own lag. That lag is treated as a feature — it is measured
and displayed (section 13), because hiding it is how eventual consistency turns into a bug report.

**`ops/invariants` verifies from outside.** It is tempting to let the invariant checker query
internal tables directly, which is faster to write and gives cleaner assertions. It is forbidden,
because a checker with privileged access can accidentally assert something that the system's own
consumers can never observe. The checker sees exactly what an operator would see: HTTP read APIs and
the event log. The cost is that some invariants become harder to express; the benefit is that a
passing report means something to a reviewer.

### 7.3 The event schema contract, and how it is enforced mechanically

The event schema is the one artefact every service must honour, and it is the one place where
"we all agreed to keep it compatible" reliably fails. In a polyglot repository the failure is silent:
a Java producer adds a required field, every Java test passes because the producer and its own tests
share the generated class, and a Python consumer in a different directory starts throwing on
deserialization only once a real message arrives. Convention cannot catch this. The enforcement
therefore has five mechanical layers, each of which fails a pull request.

**Layer 1 — one source, no hand-written event types.** `contracts/events/**/*.avsc` is the only place
an event shape is defined. Avro is chosen over Protobuf and JSON Schema because its compatibility
rules are formally specified per-field (default values, union ordering, aliases) and are implemented
identically by the registry and by every language runtime, which means "is this change compatible"
has one answer rather than three. Section 7.4 names what that choice costs.

**Layer 2 — code generation, committed and re-verified.** `make contracts` regenerates
`generated/java`, `generated/python`, and `generated/typescript` from the schemas. The output is
committed so that a clone builds without a codegen step and so that a schema change shows its blast
radius in the diff. CI job `contracts-codegen` re-runs generation and fails if `git diff --exit-code
generated/` is non-empty. Generated code cannot drift from the schema, because drift is a red build.

**Layer 3 — registry compatibility check against a frozen baseline.** `contracts/registry/baseline/`
holds the current registered schema versions. CI job `contracts-compat` starts a Schema Registry
container, seeds it from the baseline, and submits every schema in the PR for a compatibility check
against its subject's registered versions. The mode per subject is declared in `subjects.yaml`:
`FULL_TRANSITIVE` for state-carrying domain events (both producers and consumers may lag arbitrarily
during a rollout, and old events stay in the log and in replays forever), `BACKWARD` for
point-to-point Saga commands (the consumer is upgraded first by deployment order, so forward
compatibility is not needed and demanding it would block reasonable changes). A failing check prints
the rejected field and the reason. Seeding from a committed baseline rather than pointing at a live
registry is deliberate: the check must work identically on a fork, offline, and on a machine that has
never deployed anything.

**Layer 4 — blast radius is named, not guessed.** `contracts/consumers.yaml` maps every subject to
its consuming services. When `contracts-compat` passes but the schema changed at all, CI comments the
list of services that consume the subject, and requires the PR to touch each of them or to carry an
explicit `contract-change:consumers-unaffected` label with a one-line reason. This exists because a
_compatible_ change can still be a semantic break — widening an enum is compatible and will still
crash a consumer whose switch has no default branch.

**Layer 5 — no raw deserialization outside `platform/*/serde`.** The registry only protects messages
that go through it. A service that reads a Kafka payload as bytes or as an untyped dict escapes every
layer above. ArchUnit (Java) and import-linter (Python) rules forbid any `services/` package from
importing a Kafka consumer/producer client directly or from calling a raw deserializer; all Kafka I/O
goes through the platform serde module, which is the only code that touches the registry client. The
same rules forbid declaring a class or dataclass whose name matches any generated event type, which
closes the "I'll just define a small local DTO" hole.

A sixth, non-mechanical layer: `platform/testing/contract-tests` runs one shared corpus of encoded
messages — including deliberately malformed and older-version records — through both the Java and the
Python serde implementations and asserts identical outcomes. This catches the case where two runtimes
technically implement Avro but disagree about, say, logical-type handling for decimals. It is a test
rather than a rule because there is nothing structural to forbid; the runtimes are simply allowed to
differ, and only a differential test finds it.

### 7.4 The tradeoffs accepted in this layout

**Tradeoff 1 — centralized contracts cost deployment independence.** A cross-service event change is
a single pull request that modifies `contracts/`, `generated/` (three languages), and every affected
service. That is the opposite of independent per-service deploys, and in a multi-team organization it
would be the wrong shape: it creates a directory that every team must touch and one CI job that every
team's PR waits on. It is accepted here because the repository has one owner, and because the failure
mode being prevented — a Java producer and a Python consumer silently disagreeing about a field —
costs far more to diagnose than a wide PR costs to review. If the repository ever had multiple owners,
the correct move is to publish `contracts/` as a versioned package per language and let services
upgrade on their own schedule, trading fast detection for independence. That path is documented in
`docs/adr/` rather than left implicit.

**Tradeoff 2 — Avro costs TypeScript ergonomics.** Avro's tooling in the JVM and Python is excellent
and in TypeScript is not. This is survivable only because of a boundary decision made for this exact
reason: **the storefront never consumes Kafka.** It reads HTTP read models generated from
`contracts/openapi`. `generated/typescript` exists for test fixtures and for the failure-demo UI that
renders the event timeline — not for a production consumer. If the storefront ever needed to consume
events directly, this choice would need revisiting, most likely by putting a typed WebSocket read
model in front of it rather than by changing serialization format.

**Tradeoff 3 — committed generated code costs a noisy diff.** Regenerating three languages produces
large mechanical diffs that bury the one-line schema change that caused them. The alternative —
generating at build time — makes clones simpler and diffs cleaner, but removes the blast-radius
signal and makes a broken generator a build-time mystery rather than a reviewable change. The noise
is mitigated by marking `generated/**` as `linguist-generated` and collapsing it in review, not by
abandoning the property.

**Tradeoff 4 — duplicated platform code across two languages.** `platform/java/outbox` and
`platform/python/outbox` are two implementations of one idea, which invites divergence. A single
implementation with a sidecar (a shared outbox relay process) was considered and rejected for the
keystone because it hides the mechanism the exhibit exists to teach behind an opaque binary. The
divergence risk is mitigated by `platform/testing/contract-tests` asserting behavioural parity, and
by the two outbox tables sharing one DDL file in `contracts/`.

## 8. The event contract

- **Topic naming:** `commerce.<context>.v<major>` — for example `commerce.orders.v1`. The major
  version is in the topic name, not only in the schema, so an incompatible redesign is a new topic
  with a dual-write migration rather than a registry override.
- **One envelope, every event.** `EventEnvelope.avsc` carries `eventId` (UUIDv7, monotonic by time so
  it doubles as a debugging aid), `eventType`, `aggregateType`, `aggregateId`, `aggregateVersion`,
  `occurredAt`, `producedAt`, `correlationId`, `causationId`, `schemaVersion`, and `payload`. The
  distinction between `occurredAt` (domain time) and `producedAt` (publication time) is what makes
  outbox-induced publication delay visible rather than confusing.
- **`correlationId` spans a whole customer journey; `causationId` names the single event that caused
  this one.** Together they reconstruct a causal tree from the log alone, which is what makes the
  failure demonstration readable without a tracing backend.
- **Partitioning:** order events by `orderId`, inventory events by `sku`, catalog events by
  `productId`. Ordering is therefore guaranteed _per aggregate only_. No consumer may assume global
  ordering, and the lint rules cannot enforce that — so the invariant suite tests it by deliberately
  interleaving partitions in one scenario.
- **Events are facts, commands are requests.** Facts are published to topics and named in the past
  tense (`InventoryReserved`). Commands are point-to-point, named imperatively (`ReserveInventory`),
  carry a `sagaId` and `stepId`, and may be rejected. The distinction matters because a fact cannot
  be refused and a command must be.
- **Payloads carry identifiers and the minimum state a consumer needs to act**, not whole aggregates.
  A fat event reduces round trips and increases the surface that every schema change must stay
  compatible with. The rule of thumb written into the ADR: include a field when a consumer would
  otherwise have to call back synchronously on the hot path; otherwise let them read it.
- **No PII in event payloads.** Customer identity travels as an opaque id; names, addresses, and
  contact details are resolved through the owning service's API under access control. This also keeps
  topic retention from becoming a data-retention obligation.

## 9. The order Saga

### 9.1 Orchestration, not choreography

The order flow is an **orchestrated** Saga: `order-orchestrator` owns a persisted state machine and
issues explicit commands. Choreography — each service reacting to the previous service's event — was
considered and rejected for this flow. Choreography distributes the process definition across six
services, so no single place answers "what happens next" or "what has this order already done," and
compensation ordering becomes emergent. For a flow with money and stock in it, the process must be
inspectable in one place, and the Saga log must be a durable record an operator can read. The
tradeoff accepted: the orchestrator is a coordination bottleneck and a single point of failure, which
is mitigated by making its own state transitions transactional-plus-outbox (so a crashed orchestrator
resumes rather than forgets) and by keeping it free of business logic beyond sequencing.

Choreography is not absent from the repository — it is how the read-side contexts (Search, Support,
Analytics, Notifications) consume the order stream, because for those there is no process to
coordinate and no compensation to order.

### 9.2 Steps and compensations

| #   | Forward step        | Owner           | Effect                                                    | Compensation        | Compensation semantics                                                    |
| --- | ------------------- | --------------- | --------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- |
| 1   | `ValidateOrder`     | order-orchestr. | Revalidate cart contents, quoted price, and address shape | none needed         | Pure; no external state changed                                           |
| 2   | `ReserveInventory`  | inventory       | Move stock from available to reserved for this order      | `ReleaseInventory`  | True inverse. Idempotent; no-op if no reservation exists for the `sagaId` |
| 3   | `AuthorizePayment`  | payment-sim     | Place a hold for the quoted total                         | `VoidAuthorization` | True inverse while the hold is open; becomes a refund once captured       |
| 4   | `ConfirmOrder`      | order-orchestr. | Persist the order as confirmed; publish `OrderConfirmed`  | `CancelOrder`       | Compensatable; the order becomes `CANCELLED` with a reason                |
| 5   | `CommitInventory`   | inventory       | Convert reservation to committed stock                    | `RestoreInventory`  | Approximate inverse; restores to available, records a correction entry    |
| 6   | `CapturePayment`    | payment-sim     | Capture the authorized hold                               | `RefundPayment`     | **Not** an inverse. A forward recovery that leaves both entries in ledger |
| 7   | `CreateShipment`    | fulfillment     | Create a shipment and enqueue it for picking              | `CancelShipment`    | Only valid before carrier handoff; rejected after                         |
| 8   | **Carrier handoff** | fulfillment     | The pivot. Parcel leaves the warehouse                    | **none**            | Forward-only from here. Recovery is a return, not a compensation          |
| 9   | `NotifyCustomer`    | notifications   | Send confirmation                                         | none                | Retriable, not compensatable. See section 10.6                            |

Step 8 is the **pivot transaction**: the point after which the Saga has no way back and the only
remedy is a new forward business process. Naming the pivot explicitly is the single most useful thing
this design does, because it converts a vague anxiety ("what if we need to cancel later?") into a
stated boundary. Before the pivot, cancellation is a compensation the system executes. After it,
cancellation is a return, owned by the Support context, with its own states and its own refund path.

Two properties are required of every compensation and are tested:

- **Idempotent.** Keyed on `(sagaId, stepId)`, a compensation applied twice has the effect of one.
- **Tolerant of a step that never committed.** A compensation may be issued for a forward step whose
  outcome is unknown — the classic ambiguous timeout. Every compensation is therefore defined to be a
  successful no-op when there is nothing to undo, rather than an error. This is what makes "compensate
  everything on failure" a safe blanket policy instead of a source of new failures.

### 9.3 When a compensation itself fails

This is the case most designs omit, and it is the case a reviewer should look for.

Compensation failure is handled in four escalating tiers, and the system is explicitly biased toward
**holding resources rather than releasing them optimistically** — an order stuck with inventory still
reserved is a recoverable annoyance; an order that released stock it never actually held is an
oversell that reaches a customer.

1. **Bounded retry.** The compensation is retried with exponential backoff and full jitter, up to a
   configured attempt ceiling and deadline. This is safe only because of the idempotency property
   above. Retries are issued by the orchestrator from its own durable timer, not by an in-memory
   scheduler, so an orchestrator restart does not lose them.
2. **Quarantine and alert.** On exhaustion, the Saga transitions to `COMPENSATION_STUCK` — a real,
   persisted, queryable state, not an error log line. The orchestrator publishes `CompensationFailed`
   carrying `sagaId`, `stepId`, the attempt history, and the last error. The affected resources stay
   in their held state. The order is presented to the customer as "processing — we are looking into
   this," never as completed and never as silently cancelled.
3. **Automatic case creation.** The Support context consumes `CompensationFailed` and opens a case
   pre-populated with the full Saga log and the causal tree assembled from `correlationId` /
   `causationId`. This is the mechanism by which a stuck order cannot be forgotten: the terminal
   technical state produces a non-terminal human work item.
4. **Operator remediation.** An authenticated admin endpoint offers exactly three actions — retry the
   compensation, mark it manually resolved with a required reason, or force-cancel with explicit
   resource disposition. Every action is itself idempotent, appends to the Saga log, and emits an
   event. There is no path that mutates order state without leaving a record.

What the system deliberately does **not** do: it does not retry forever (an unbounded retry against a
genuinely broken dependency is a denial-of-service against oneself), it does not release held
resources on compensation failure (the oversell bias above), and it does not drop the Saga into a
dead-letter queue and call it handled (a DLQ with no owner is a silent loss with extra steps).

A reconciliation job runs on a schedule and independently scans for Sagas that have been in any
non-terminal state past a per-state deadline, emitting `SagaStalled`. This exists because the failure
modes above assume the orchestrator noticed; the reconciler covers the case where it did not — an
orchestrator that crashed after committing a step but before scheduling its timer.

## 10. Delivery and consistency: what is actually guaranteed

### 10.1 The honest statement

**CommerceFlow does not provide exactly-once delivery, and does not claim it.** Exactly-once delivery
across a network to a system with external side effects is not achievable; what is achievable is
at-least-once delivery with effectively-once _processing_, and that is what is built.

Kafka's transactional producer plus `read_process_write` does give exactly-once semantics for
Kafka-to-Kafka transformations — offsets and output records commit atomically within a transaction
scope. That is used where it applies, in the Analytics streaming topology. It does **not** extend to
a Postgres write, an HTTP call, or an email, because those are not participants in the Kafka
transaction. Any design that writes to a database inside a Kafka transaction and calls the result
exactly-once is wrong, and saying so plainly is part of the exhibit.

The guarantee the system provides, stated as one sentence: _every event is delivered at least once,
and every business effect is applied at most once, so every business effect is applied exactly once._

### 10.2 The transactional outbox

The problem the outbox solves is the dual write: a service that commits a database transaction and
then publishes to Kafka can crash between the two, and the state change exists with no event, which
is unrecoverable by retry because the state change looks complete.

The mechanism: the state change and an `outbox` row are written in **one local ACID transaction**. A
separate relay reads the outbox and publishes to Kafka. If the service crashes after commit, the row
is still there and the relay publishes it. If the relay crashes after publishing but before marking
the row sent, it republishes — hence a duplicate, hence section 10.3.

The outbox table is defined once in `contracts/` and implemented by `platform/*/outbox` in both
languages. It carries `id`, `aggregate_type`, `aggregate_id`, `event_type`, `payload`,
`correlation_id`, `causation_id`, `created_at`, and `published_at`.

Two relay strategies are implemented, and the choice is per service rather than global:

- **Log-based (Debezium reading the WAL).** Lower latency, no polling load on the primary, and no
  risk of the polling query becoming a hotspot. Costs: a connector to operate, replication-slot
  management, and a failure mode (a stalled slot retaining WAL) that can fill a disk.
- **Polling publisher.** A query for unpublished rows with `SKIP LOCKED`, a bounded batch, and a
  publish-then-mark loop. Costs: latency floor set by the poll interval, and load on the primary.
  Benefit: no additional infrastructure, and it is comprehensible in fifty lines.

Both are kept because the comparison is itself the content — DST-03 exists to crash both at every
boundary and demonstrate that neither loses an event and that both can duplicate one. The keystone
defaults to log-based for the high-volume order and inventory paths and polling for the low-volume
ones, on the grounds that the polling variant's operational simplicity is worth more than its latency
costs where volume is low.

### 10.3 Idempotent consumers

Every consumer is wrapped by `platform/*/idempotency`. The wrapper maintains a `processed_event`
table with a unique constraint on `(consumer_name, event_id)`.

The order of operations is what matters: the handler's side effect **and** the `processed_event`
insert occur in the same local transaction, which commits before the Kafka offset is committed. The
consequences are exact:

- Crash before the local commit: nothing happened; redelivery reprocesses cleanly.
- Crash after the local commit but before the offset commit: the effect happened once and the
  `processed_event` row exists; redelivery hits the unique constraint, the wrapper acks and skips.
- The offset is therefore always at or behind the truth, never ahead of it. Duplicates are possible
  by construction; loss is not.

Keying on `event_id` rather than `(topic, partition, offset)` is deliberate: offsets are not stable
across a topic rebuild, a replay from a compacted topic, or a migration to a new topic version, and
the whole demonstration in section 12 depends on being able to replay from earliest and have nothing
double-apply.

The `processed_event` table is pruned on a retention window longer than the maximum possible
redelivery lag — including the lag introduced by a deliberate replay — and the window is a stated
configuration value, because a too-short window silently reintroduces double application. Pruning
uses time-based partitions so that reclaiming space is a partition drop rather than a mass delete.

Handlers that cannot be made idempotent by a database constraint must declare themselves as such and
are routed through the notification path's weaker guarantee (section 10.6). The point is that the
exception is explicit and enumerable, not accidental.

### 10.4 Idempotency keys at the edge

Internal dedupe handles broker-induced duplicates. It does not handle a customer clicking "Place
order" twice, or a mobile client retrying a request whose response was lost.

- The storefront generates an `Idempotency-Key` (UUIDv7) when the checkout page is opened, not when
  the button is clicked, so that a retry of the same intent carries the same key.
- `cart-checkout` stores `(idempotency_key, request_fingerprint, order_id, response_snapshot)` with a
  unique constraint on the key, written in the same transaction that creates the order.
- A repeat with the same key and a matching fingerprint returns the stored response. A repeat with
  the same key and a _different_ fingerprint returns `409 Conflict` — reusing a key for different
  content is a client bug and must be surfaced loudly rather than resolved by guessing.
- A request arriving while the first is still in flight receives `409` with a retry hint, not a
  second order.
- Keys expire on a stated window; the window is longer than any plausible client retry horizon.

The same pattern is applied to every Saga command: `sagaId` plus `stepId` is the idempotency key for
`ReserveInventory`, `AuthorizePayment`, and the rest. This is what makes the orchestrator free to
retry any step whose outcome it does not know.

### 10.5 Ordering and out-of-order handling

Ordering is guaranteed per partition, and partitions are keyed per aggregate — so a consumer sees one
order's events in order, and sees nothing reliable about the relative order of two different orders.

Read-model projections apply a version gate: an event whose `aggregateVersion` is not
`currentVersion + 1` is held in a bounded resequencing buffer until the gap fills or a timeout
expires, at which point the projection requests a snapshot from the owning service rather than
guessing. Last-writer-wins on `occurredAt` is used only where the field is genuinely commutative
(a denormalized product title), and each such use is annotated in code with why it is safe.

Analytics accepts lateness explicitly: windows have a defined allowed-lateness bound and emit
corrections for late arrivals rather than dropping them, and the count of late-and-dropped records is
a published metric rather than an internal detail. A dropped late record that nobody counts is the
most common way a streaming aggregate quietly becomes wrong.

### 10.6 Where the guarantee genuinely weakens

Notifications send external messages. A message that has left the system cannot be unsent, and the
provider's own accept-then-deliver semantics mean a confirmed send is not a confirmed delivery.
The system therefore promises: **at most one send per `(recipient, notification_key)` pair**, enforced
by a unique constraint written in the same transaction as the send _intent_ — but the send itself is
an external call that can succeed while its acknowledgement is lost. In that specific window, a
duplicate message is possible and the system cannot prevent it.

This is stated in the design and demonstrated in the failure harness rather than papered over,
because it is the honest boundary of the technique. The mitigation is to make the window as small as
possible (record intent, send, record outcome, with the intent row as the guard) and to make the
duplicate harmless (notifications are written to be safe to receive twice). DST-08 explores the
problem further.

## 11. The storefront and the read side

The storefront is a Next.js application that is deliberately _not_ an event consumer. It reads
purpose-built HTTP read models generated from `contracts/openapi`, and it owns no business state.

It exists in this exhibit for two reasons. First, the selection entry and the absorbed FS-15 scope
both call for a polished storefront, and a marketplace whose UI is a Swagger page does not demonstrate
that the engineer can finish anything. Second, and more importantly, it is where eventual consistency
becomes a **user-experience design problem** rather than an abstract property: after checkout, the
order detail page is served from a projection that may lag the write model by hundreds of
milliseconds. The design response is read-your-writes for the submitting session (the confirmation
route reads the authoritative order service, not the projection) and visible, honest staleness
elsewhere ("updated a moment ago") instead of a spinner that implies a value is loading when it is
actually merely old.

The storefront inherits the platform PRD's section 9 budgets in spirit — Core Web Vitals targets,
route-level JavaScript ceilings, no layout shift from media, keyboard and screen-reader navigation,
and a no-JavaScript fallback for browse and product detail. Those are targets for this repository's
own CI, not claims; none has been measured.

One storefront surface is unique to this exhibit: the **event timeline view**, an operator-facing
page that renders the causal tree of a single order from `correlationId` and `causationId`. It is the
artefact a reviewer watches during the failure demonstration, and it is built as a first-class part of
the product rather than a debugging afterthought.

## 12. The failure-injection and recovery demonstration

This is the point of the exhibit. Everything above is the setup.

### 12.1 Principles

- **Failures are injected from outside the application.** `ops/failure/injectors` uses container
  control, a TCP proxy (Toxiproxy) for latency and partition, clock manipulation, and
  externally-toggled fault flags. No service contains an `if (chaosMode)` branch, because a system
  that knows it is being tested is not being tested.
- **Every scenario is a committed YAML file** with a fixed seed, a declared steady-state workload, an
  injection schedule, and an expected-observation list. A scenario is re-runnable by ID.
- **Invariants are asserted continuously**, before, during, and after injection — not only at the end.
  A system that is wrong for four seconds and right afterwards has still been wrong.
- **The output is a report, not a video.** Each run produces a machine-readable result plus a rendered
  timeline, stamped with commit SHA, container image digests, scenario ID, seed, and wall-clock
  duration.

### 12.2 The invariant suite

`ops/invariants` asserts these from outside the services, via read APIs and the event log:

1. **No oversell.** For every SKU: `available + reserved + committed + shipped` equals the initial
   stock plus recorded corrections, and `available >= 0` at every observation.
2. **No unauthorized shipment.** Every shipment has a corresponding captured payment that precedes it
   in causal order.
3. **No unpaid completion.** Every order in a completed state has exactly one capture and zero
   uncompensated authorizations.
4. **Ledger balance.** Every financial entry set sums to zero (DST-02's invariant, applied here).
5. **Effect count equals intent count.** For a workload of N distinct idempotency keys, the number of
   distinct business effects is exactly N, regardless of how many duplicate deliveries occurred. The
   harness records duplicates delivered separately, so the report shows both numbers side by side.
6. **Terminality.** Within a bounded time after injection ends, every Saga reaches a terminal state or
   an explicitly-quarantined one (`COMPENSATION_STUCK` with an open support case). No Saga is left in
   a transient state with no owner.
7. **No silent loss.** Every event written to an outbox appears in its topic; every event in a topic
   is processed or is in a dead-letter topic with a recorded reason. Counts reconcile.

Invariants 5 and 7 are the ones that make the exhibit worth a reviewer's time, because they are
exactly the properties that ordinary testing does not reach.

### 12.3 Scenarios

| ID     | Injected failure                                                            | What it exercises                            | What the reviewer should observe                                                                   |
| ------ | --------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| FS-001 | Kill a consumer with SIGKILL between its local commit and its offset commit | Idempotent consumer ordering (10.3)          | Redelivery on restart; effect count unchanged; duplicate counter increments                        |
| FS-002 | Kill a producer between its DB commit and the relay's publish               | Transactional outbox (10.2)                  | The event still appears after restart; no order exists without its event                           |
| FS-003 | Partition the broker from all services for a sustained interval             | Backpressure, retry, and recovery            | Checkout degrades and rejects cleanly rather than accepting-and-losing; lag drains after healing   |
| FS-004 | Replay an entire topic from earliest into running consumers                 | Duplicate absorption at scale                | Enormous duplicate count, zero change in effect count and in every balance                         |
| FS-005 | `payment-sim` returns a timeout after having committed the authorization    | Ambiguous-outcome handling (9.2, 10.4)       | The orchestrator queries by idempotency key rather than blindly retrying; exactly one hold exists  |
| FS-006 | `inventory` rejects `ReleaseInventory` persistently                         | Compensation failure (9.3)                   | Bounded retries, then `COMPENSATION_STUCK`, a support case opened, stock held rather than released |
| FS-007 | Publish a payload that violates the subject's schema, bypassing the serde   | Poison-message quarantine                    | DLQ with reason, consumer keeps progressing, and the report notes CI is the real defence           |
| FS-008 | Stall one partition's consumer to build multi-minute lag                    | Lag visibility and read-model staleness UX   | Staleness is shown to the user honestly; no projection invents a value                             |
| FS-009 | Kill the orchestrator after a step commits but before its timer is set      | The reconciliation job (9.3)                 | `SagaStalled` emitted by the reconciler; the Saga resumes without human action                     |
| FS-010 | Fail over the orders database mid-Saga                                      | Durable state and connection recovery        | The Saga resumes from its persisted state; no step re-executes its effect                          |
| FS-011 | Skew a service's clock forward and back                                     | Time-dependent logic and window handling     | Windows and timeouts behave on event time, not wall time, where it matters                         |
| FS-012 | Deliver two partitions' events interleaved in an adversarial order          | The per-partition-ordering assumption (10.5) | Version-gated projections buffer rather than corrupt                                               |

### 12.4 What a reviewer does

One command runs a scenario: the stack comes up, a steady-state workload begins, the injector fires
on schedule, the invariant suite runs throughout, and a report is written to `evidence/`. The
reviewer watches the event timeline view while it happens and reads the report afterwards. The
intended reaction is not "impressive demo" but "this person knows what breaks, and proved it holds."

A scenario that fails its invariants is not deleted. Its report stays, with the defect and its
resolution recorded, because a repository of only-passing scenarios is less credible than one that
shows a failure being found and fixed.

## 13. Observability

Observability here is not a dashboard; it is the instrument that makes section 12's claims legible.

- **Correlation propagation is mandatory.** `correlationId` flows from the storefront request through
  every HTTP call, every command, and every event, and the platform serde module refuses to encode an
  envelope without one. OpenTelemetry traces carry the same id so a trace and an event timeline can be
  aligned.
- **Consumer lag per group per partition** is exported, alarmed on a stated threshold, and rendered in
  the timeline view — because lag is the single most useful signal in an event-driven system and the
  one most often discovered only after a complaint.
- **Saga state census.** A gauge per Saga state, so that `COMPENSATION_STUCK > 0` is an alert rather
  than a discovery.
- **Outbox depth and age.** The oldest unpublished row's age is the real measure of outbox health; a
  depth of zero with one ancient row is worse than a depth of a thousand fresh ones.
- **Duplicate-suppression counter.** Every skip by the idempotency wrapper is counted per consumer.
  This number is expected to be non-zero in normal operation, and treating it as an error rather than
  a fact is a common misreading worth pre-empting in the runbook.
- **Structured logs only**, JSON, with the correlation fields promoted to top-level keys.

## 14. Targets and budgets

Every figure below is a **target to be met and proved**, not an observation. Each names the
measurement method and the artefact that would carry the result. None has been measured; the
manifest's empty `metrics` array is correct and stays correct until these are produced.

| Target                                   | Value to be met                    | Measurement method                                                                  |
| ---------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| Checkout submission to `OrderConfirmed`  | p95 budget, nominal synthetic load | k6 scenario, fixed seed, pinned images, recorded environment; report in `evidence/` |
| Outbox publication lag (log-based relay) | p99 budget                         | `producedAt − occurredAt` histogram over the run                                    |
| Outbox publication lag (polling relay)   | p99 budget, stated poll interval   | Same histogram, separated by relay strategy                                         |
| Consumer lag recovery after FS-003 heals | Time-to-zero budget                | Lag exporter series captured for the scenario window                                |
| Saga completion under FS-001/002         | 100% terminal within bounded time  | Invariant 6, asserted by the suite, not eyeballed                                   |
| Duplicate absorption under FS-004        | Effect count exactly equals N      | Invariant 5; both the duplicate count and the effect count are published            |
| Support projection lag                   | p95 budget                         | Event `occurredAt` to projection visibility, sampled continuously                   |
| Storefront LCP / INP / CLS               | Platform PRD 9.1 thresholds        | Lighthouse under a pinned version and reference profile, median of five runs        |
| Cold `docker compose up` to ready        | Wall-clock budget on a stated spec | Timed in CI on a declared runner; the spec is part of the number                    |
| Full test suite wall time                | Wall-clock budget                  | CI timing, reported per job                                                         |
| Failure scenario end-to-end runtime      | Per-scenario budget                | Recorded in each scenario report                                                    |

A budget without a declared environment is not a budget, so every report records commit SHA,
container image digests, host CPU/memory, dataset fixture hash, run count, and the raw result file —
mirroring the discipline of platform PRD 9.2.

## 15. Data stores

- **PostgreSQL per service**, separate schemas and separate users, no cross-schema grants. Chosen for
  transactional outbox support (`SKIP LOCKED`, logical replication for Debezium) and because one
  well-understood engine across ten services is worth more than per-service optimality.
- **Kafka** as the event log, with topic-level retention chosen per context and compaction only where
  a topic is genuinely a changelog.
- **Redis** for cart state and read-through caching, chosen because cart is the one place where
  durability requirements are genuinely weaker than the order path's.
- **OpenSearch** for the Search context's index, fed from the catalog event stream and rebuildable
  from scratch — rebuild time is a stated budget, because an index that cannot be rebuilt in a known
  time is an outage waiting to happen.

These are proposals; the manifest's `stack` arrays are empty and section 18 records that.

## 16. Project history: the FS-15 merge

`content/editorial/flagship-rotation.v1.json` records that on **2026-08-28**, DST-01 and the former
FS-15 "CommerceFlow Marketplace" were merged into a single record. The two entries described one
product from two sides — FS-15 approached it as a full-stack commerce product, DST-01 as a Track 5
distributed-systems keystone — and the GitHub pin rotation lists a single CommerceFlow flagship, so
maintaining two records would have meant either two half-products or one product claimed twice.

DST-01 retained the identifier because it is the Track 5 keystone and owns the `commerceflow`
repository. FS-15's product scope folded into DST-01's summary, which is why the manifest's summary
carries both the distributed-systems mechanisms and "a polished storefront." The full-stack track
dropped to fourteen entries with one open slot.

That slot has since been refilled: FS-15 now holds **Tislim Cross-Border B2B Marketplace**, which is
real work in progress rather than a planned exhibit, and is unrelated to CommerceFlow beyond having
inherited the slot number. The two should not be confused when reading the track listing — the
identifier FS-15 means different things before and after 2026-08-28.

The practical consequence for this document: the storefront is not decoration attached to a backend
exhibit. It is the absorbed half of the product, and section 11 treats it as such.

## 17. Moving from proof level `code` to `measured`

The portfolio's proof ladder is `code → live → measured → externally-validated`. DST-01 is at `code`,
and platform PRD 8.3 states the gate plainly: **`measured` proof requires at least one metric with
evidence.** That is the floor, not the bar this project should clear. What follows is the complete
list of what must exist.

### 17.1 Artefacts that must exist in the repository

1. **A running, reproducible stack.** `ops/compose` brings up every service, Kafka, the registry, and
   the databases from pinned image digests, and a documented one-command bootstrap seeds a fixture
   catalog. Reproducible means: a clean machine, a stated toolchain, and no undocumented step.
2. **A committed load harness.** k6 (or Gatling) scenarios under `ops/`, with fixed seeds, declared
   virtual-user counts, declared steady-state duration, and a fixture dataset whose hash is recorded.
3. **All twelve failure scenarios implemented and runnable by ID**, each producing a report.
4. **The invariant suite** implementing all seven invariants of section 12.2, running as part of every
   scenario and as part of CI.
5. **The five CI enforcement layers of section 7.3 green**, with at least one committed example of a
   pull request that they correctly rejected (kept as a fixture, not as history).
6. **An architecture diagram** in `docs/diagrams/`, published as an evidence artefact with a stable
   URL.
7. **ADRs** for at least: orchestration over choreography, Avro over Protobuf, committed generated
   code, the polling-versus-log-based relay split, and the payment-simulation boundary.

### 17.2 Measurements that must be taken

Each of the following must be produced by a repeatable run, not a one-off, and each must carry
`environment`, `sampleSize`, `synthetic: true`, `measuredAt`, and `evidenceUrl` as required by
platform PRD 8.3:

1. Checkout-to-confirmation latency distribution under a declared synthetic load.
2. Outbox publication lag, reported separately for the log-based and polling relays.
3. Consumer lag recovery time after the broker partition in FS-003 heals.
4. Duplicate-absorption result from FS-004: duplicates delivered, and business effects applied.
5. Saga terminality time after each of FS-001, FS-002, FS-006, and FS-009.
6. Support-projection lag distribution.
7. Storefront Core Web Vitals against the platform PRD 9.1 thresholds, median of five runs under a
   pinned Lighthouse version.
8. Search index full-rebuild wall time.

At minimum, metrics 1, 2, 4, and 5 must be present in the manifest, because those four are the ones
that speak to the claims this exhibit actually makes. A latency number alone would satisfy the letter
of the gate and misrepresent the project.

### 17.3 Evidence records that must be registered

Each needs an `id`, `type`, `title`, stable `url`, `verifiedAt`, and `external` flag:

- A failure-recovery report index linking all twelve scenario reports, marked `primary: true`.
- The load-test report with its full environment block.
- The architecture diagram.
- The contract-enforcement report showing the compatibility check and codegen verification in CI.
- The invariant suite's definition and its most recent full pass.

### 17.4 Manifest changes that must accompany the promotion

`status` from `planned` to `in-progress` and then `complete`; `proofLevel` from `code` to `measured`;
`dates.started`, `dates.completed`, and `dates.lastVerified` populated with real dates; `stack`
arrays populated; `content.problem` and `content.limitations` written; `metrics` and `evidence`
populated as above; a non-placeholder card image with real alt text; `integrity.reviewedBy` and
`reviewedAt` set by a human.

Note that `measured` alone does not make this project globally featured. Platform PRD 8.3 gates
`featured.global` on tier `flagship`, proof level `measured` or better, and a non-placeholder card
image. DST-01's tier is `keystone`, and `flagship-rotation.v1.json` is explicit that it records intent
only and that promotion remains a human act.

### 17.5 What will not count

- A screenshot of a dashboard. It has no environment block and cannot be re-run.
- A number typed into the manifest by hand. Every metric traces to a report file.
- A single successful run. Targets are distributions; one run is an anecdote.
- A passing scenario suite with scenarios quietly removed. The scenario list is committed and its
  changes are reviewable.
- Any claim of real users, real revenue, real traffic, or production uptime. There are none, and
  there will be none from this project.

## 18. Divergences from the current manifest

Everything in this list is **beyond the current manifest**. The manifest wins until a human edits it.

1. **`content.problem` is `null`.** Section 1 specifies it. Proposed, not recorded.
2. **`stack` arrays are empty.** Sections 5 and 15 propose Java/Spring Boot, Python/FastAPI,
   TypeScript/Next.js, Kafka, Schema Registry, Avro, PostgreSQL, Debezium, Redis, OpenSearch,
   OpenTelemetry, k6, Toxiproxy, ArchUnit, and import-linter. None is recorded, and every entry must
   come from the versioned vocabularies named in platform PRD 8.3 before it can be added.
3. **The manifest has no `architecture`, `repository`, `tagline`, or `content.hardestProblem` block.**
   This document proposes content for all four; the hardest problem, stated for the record, is
   _guaranteeing that a business effect is applied exactly once across services that share no
   transaction, while a compensation is failing._
4. **`capabilities` is `["distributed-systems"]` only.** Event-driven architecture, sagas, and
   idempotency are arguably distinct capabilities, but the vocabulary is versioned and adding terms is
   a separate, deliberate change.
5. **`roles` is `["backend-engineer", "ai-engineer"]`** while the selection document says "Backend
   Engineer · AI infrastructure." Section 5 reconciles these: the AI-infrastructure surface is search
   relevance, support triage, and the analytics/feature pipelines. No manifest change is proposed.
6. **Twelve failure scenarios, seven invariants, and eight measurement targets** are specified here
   and exist nowhere else. They are commitments this document makes on the project's behalf, and they
   are not yet evidence of anything.
7. **`visibility` is `unlisted` and `status` is `planned`.** Correct today. Section 17.4 states what
   must be true before either changes.
