# DE-01 — SignalLake Streaming Data Platform

- **Project ID:** DE-01
- **Repository:** `signallake`
- **Track:** 11 — Data engineering and analytics platforms
- **Tier:** keystone
- **Primary roles:** Backend Engineer · AI Engineer
- **Manifest:** `content/projects/DE-01.json`
- **Upstream dependency:** DST-01 CommerceFlow (`commerceflow`), Track 5
- **Document status:** design and acceptance specification for unbuilt work

---

## 0. What this document is, and what it is not

This is a design and acceptance specification for a system that **has not been built**. The
manifest records `status: planned` and `proofLevel: code`; its `stack`, `evidence`, `metrics`, and
`content.problem` fields are empty. Per platform PRD 5.1.1 the manifest, not this document, is the
source of truth for anything the portfolio renders. Where this document proposes values the
manifest does not yet carry, those proposals are flagged in Section 16 and remain proposals until
someone edits the manifest.

Consequently every quantity in this document is a **target** or a **budget** with a stated
measurement method. None of them is a result. There are no throughput figures, no freshness
readings, no data-quality pass rates, no row counts, and no dates, because nothing has run. Platform
PRD 0.10 and 12.2 forbid inventing them, and the value of this exhibit depends entirely on the
difference between a number that was measured and a number that was asserted. A target that is
missed and reported honestly is worth more here than a target that is met by writing it down.

All data in this system is synthetic. The event generator is part of the deliverable and its output
is labelled synthetic wherever a figure derived from it is published.

---

## 1. The problem, and who has it

The manifest's `content.problem` field is null. This section specifies it; it is a proposal for that
field, not a record of it.

A marketplace emits events continuously — listings created, carts modified, orders placed, payments
authorised, shipments dispatched, refunds issued. Three groups of people want answers from those
events, and they want incompatible things.

**Operators** want to know within seconds whether something has broken: whether checkout conversion
has fallen off a cliff in the last ten minutes, whether a payment provider has started timing out,
whether a fulfilment partner has stopped acknowledging shipments. They will accept an answer that is
provisional and occasionally revised, because a provisional answer in fifteen seconds is worth more
than a perfect answer tomorrow.

**Analysts** want the opposite. They want a table where the grain is declared, the history is
complete, the definition of "net revenue" is the same one used last quarter, and yesterday's number
does not change when they refresh. They will wait hours for that. They will not accept a number that
silently moves.

**Downstream model builders** — the recommendation and ranking work in Track 12 — want features that
are point-in-time correct: computed only from data that was actually available at the timestamp
attached to the training label. A feature pipeline that accidentally reads the future produces a
model that looks excellent offline and fails in production.

The problem is that these three demands are usually satisfied by three disconnected systems that
disagree with each other, and nobody can say which one is wrong. The operator's dashboard says one
revenue figure, the warehouse says another, the feature store says a third, and the reconciliation
is somebody's spreadsheet. The failure is not any single pipeline; it is the absence of a stated
contract about completeness, an absence of lineage that survives a language boundary, and the habit
of treating data quality as an alerting concern rather than as a published property of a dataset.

SignalLake's thesis is narrow and testable: a platform should be able to state, for every published
table, what its grain is, how complete it is right now, which upstream events produced it, which
quality assertions it passed, and how to rebuild it from scratch and get the same answer. The
exhibit is the evidence that those statements can be produced mechanically rather than asserted in a
README.

**Who reviews this.** The intended reader is a hiring engineer or data platform lead who has seen a
dozen portfolios containing a Kafka producer, a Flink word count, and a dbt project with three
models and no tests. The differentiator is not the tool list in the summary line. It is Section 11:
lineage and quality published as artefacts a stranger can open and check without running anything.

---

## 2. Non-goals

Stated explicitly, because a keystone project in a fifteen-project track attracts scope like a drain.

- **Not a production data platform.** No real users, no real money, no real personal data, no
  uptime claim, no on-call rotation. The scale story is a design argument plus a measurement on a
  named fixture, never an assertion of scale achieved.
- **Not a managed-cloud showcase.** The reference deployment is local and containerised so a
  reviewer can reproduce it. Cloud deployment may be documented as a path; it is not the proof.
- **Not the owner of CommerceFlow's producers.** SignalLake consumes an event contract it does not
  control. See Section 3. Any change that would require editing `commerceflow` is out of scope by
  construction.
- **Not a lakehouse table-format comparison.** That is DE-04. DE-01 picks one table format, states
  why, and moves on.
- **Not a data-contract registry product.** That is DE-11. DE-01 consumes a schema registry; it does
  not build a governance UI over one.
- **Not a BI tool, not a semantic-layer product, not a notebook environment.** Marts are exposed via
  SQL and a small governed API surface (DE-15); rendering is somebody else's job.
- **Not a Kafka, Flink, or Spark reimplementation.** No custom consumer-group protocol, no
  hand-rolled state backend, no bespoke scheduler. The exhibit is composition and correctness, not
  reinvention.
- **Not a streaming-versus-batch benchmark.** Both engines run here for the reasons given in
  Section 5, one of which is disclosed as demonstrative.
- **Not a home for the fourteen focused exhibits' depth.** DE-02..DE-15 live in the same repository
  and extend the spine. DE-01 must not absorb their subject matter; if CDC detail, anomaly-detection
  detail, or PII governance detail migrates into the keystone, the keystone stops being legible.

---

## 3. The upstream contract: CommerceFlow marketplace events

### 3.1 Two repositories, one contract

The events SignalLake ingests are produced by DST-01 CommerceFlow, which lives in a separate
repository (`commerceflow`) and is a separate exhibit with its own lifecycle. This is deliberate and
it is the most interesting constraint in the project, because it forbids the shortcut that makes
most portfolio data pipelines uninteresting: editing the producer when the consumer is inconvenient.

The contract is therefore treated as **external and versioned**. SignalLake may not assume it can
change a field, add a field, tighten a nullability, or ask for a backfill. It may only state what it
requires, detect when what it requires stops being true, and degrade in a defined way.

### 3.2 Shape of the contract

Events are Avro-encoded, published to Kafka, and registered in a schema registry. Each event
carries a mandatory envelope, separate from its payload:

- `event_id` — producer-assigned UUID, unique per logical event, stable across producer retries.
  This is the deduplication key and the entire at-least-once story depends on it.
- `event_type` and `event_version` — the logical name and the contract major version.
- `occurred_at` — the business timestamp, assigned by the producer at the moment the thing happened.
  All event-time processing uses this and only this.
- `recorded_at` — the moment the producer wrote the event. The difference between `recorded_at` and
  `occurred_at` is the producer's own lag and is measured, not assumed.
- `partition_key` — the entity the event is about (order id, listing id, session id), which fixes
  Kafka partitioning and therefore per-key ordering.
- `producer` and `trace_id` — provenance, and the join key back to CommerceFlow's own traces.

The payload is per event type and is the part SignalLake does not control.

### 3.3 Compatibility policy

SignalLake declares, per topic, the compatibility mode it requires of the registry and the behaviour
it guarantees in return:

- **Backward-compatible change** (field added with a default, field documentation changed, optional
  field removed): consumed transparently. Flink and Spark read with the reader schema SignalLake
  pinned; new fields are ignored until a model explicitly adopts them. No pipeline change, no
  restatement.
- **Forward-compatible change** (producer starts writing a new optional field SignalLake does not
  know about): identical handling. The raw landing zone stores the original bytes, so a field
  ignored today is recoverable tomorrow without asking the producer to resend.
- **Breaking change** (field removed, type narrowed, semantics of an existing field changed): must
  arrive as a new major `event_version` on a new topic or a new subject. SignalLake pins to the old
  version and continues. The pipelines do not break; they become stale, and staleness is visible
  because freshness is a published property.

The last point is the design's load-bearing claim. A breaking upstream change should produce a
**visible freshness failure on a named dataset**, not a crash loop and not a silent stream of nulls.

### 3.4 What happens when the upstream schema evolves

The mechanism, concretely:

1. Contracts are **vendored and pinned**. `contracts/marketplace/` holds a copy of the CommerceFlow
   schemas at an explicit version, and `contracts/registry/pins.yaml` records subject, version, and
   schema fingerprint. Nothing in the repository reads a schema from a live registry at build time;
   builds are hermetic.
2. A scheduled CI job compares the live registry against the pins and opens a pull request when they
   diverge. That pull request contains a generated **compatibility report**: which subjects moved,
   the Avro compatibility verdict, and — by walking the lineage graph from Section 11 — the list of
   downstream staging models, marts, and jobs that reference the affected fields.
3. Backward- and forward-compatible moves merge with the pin bump and a regenerated report. CI
   proves the change is non-breaking by running the existing fixtures against the new reader schema.
4. Breaking moves cannot merge automatically. They require a new pinned major, a new staging model,
   and a declared migration window during which both versions are read and unioned in the
   intermediate layer. The mart's column contract does not change until the migration closes.
5. If a producer violates the policy — emits a breaking change in place — the deserialiser routes
   the offending records to a dead-letter topic with the failure reason attached, the freshness
   assertion on the affected dataset fails, and the quality report names the subject and the field.
   The platform does not guess.

**Tradeoff.** Pinning and vendoring means SignalLake is always slightly behind the producer, and
adopting a genuinely useful new field costs a pull request rather than nothing. That is accepted:
hermetic builds and an explicit adoption step are worth more than automatic drift, and the whole
point of the exhibit is that surprises are detected rather than absorbed.

### 3.5 Contract tests

Both sides of the contract are tested from the same artefacts. `contracts/` exports a set of golden
event fixtures — one canonical instance per event type per pinned version — and SignalLake's tests
assert that every staging model produces the declared grain and types from those fixtures. If
CommerceFlow ever adopts the same fixtures as producer tests, the contract becomes bilateral; until
then it is unilateral and SignalLake's assertions are about what it consumes, not what is sent.

---

## 4. Ingestion and the landing zone

Kafka is the boundary. Behind it, three properties are established before any processing happens,
because everything downstream depends on them.

**Keying and ordering.** Events are partitioned by `partition_key`, so all events about one order
are ordered relative to each other and to nothing else. Global ordering is not available and is not
required by any model in this platform; every aggregation is either per-key or event-time-windowed.
Making that explicit early prevents the class of bug where a correct-looking join silently assumes
cross-partition ordering.

**Raw archive.** A dedicated sink writes every consumed event, in its original encoded form plus the
envelope and the Kafka coordinates (topic, partition, offset, consume timestamp), to an immutable
raw zone partitioned by ingest date. The raw zone is the system of record for replay. It is
append-only, never rewritten, and never schema-migrated. Retention on Kafka can then be short
(days), because history lives in object storage, which is the cheaper and more durable place for it.
Section 10's backfill story reads exclusively from here.

**Dead letters.** Decode failures, envelope violations, and records whose `occurred_at` is
implausible (before the platform's epoch, or far in the future) go to a dead-letter topic with the
original bytes and a structured reason. Dead letters are a measured quantity: a non-zero
dead-letter rate is a quality assertion failure on the source, not an operational footnote.

**Table format.** Derived tables use Iceberg on object storage. The reason is Section 10: partition
-level atomic replacement and snapshot isolation are what make idempotent restatement possible, and
they are the capability the backfill design is built on. The alternative — plain Parquet with
directory overwrite — loses reader isolation during a rewrite and makes "which snapshot produced
this published number" unanswerable. DE-04 exists to interrogate that choice properly; DE-01 makes
it once and records the reasoning here.

---

## 5. The streaming and batch split

### 5.1 What genuinely needs Flink

Flink is justified where the computation is **stateful over event time** and the answer is wanted
before the window can possibly be closed:

- **Session windows over behavioural events.** Sessionisation is defined by a gap in event time, not
  by a clock boundary. Expressing it in batch requires reprocessing a window wide enough to contain
  the longest possible session on every run; expressing it in Flink is a session window with a gap
  parameter and a keyed state backend. This is the clearest case.
- **Long-lived stateful joins across streams.** Order placed, payment authorised, and shipment
  dispatched arrive minutes to hours apart on different topics. Joining them requires keyed state
  that outlives any single micro-batch and a timer to emit the "order never paid" outcome when the
  matching event does not arrive. Batch can do this by rescanning; it cannot emit the negative
  outcome promptly.
- **Continuous windowed aggregates feeding operational views.** Per-minute order counts and
  conversion rates where the consumer is an operator watching a dashboard.
- **Late-data routing.** Deciding, per record, whether an event is on time, late-but-accepted, or
  too late — and side-outputting the third case — requires a watermark, which is a streaming
  construct.

### 5.2 What belongs in Spark

Spark is justified where the computation is **wide, historical, or cost-sensitive**:

- **Full-history recomputation.** Rebuilding a derived table from the raw zone across months. This
  is a wide shuffle over cold storage; a streaming engine is the wrong shape for it.
- **Backfill and restatement.** Section 10. Every backfill is a Spark job, without exception.
- **Compaction and maintenance.** Rewriting small files, expiring snapshots, rewriting manifests.
- **Point-in-time feature computation.** As-of joins over the full history with strict
  left-boundedness, which is the mechanism that prevents label leakage for Track 12's consumers.
- **The reconciliation reference.** See below.

### 5.3 The honest reason both are here

Part of the reason this exhibit runs Flink and Spark in one repository is **to demonstrate breadth**.
That is a portfolio motive, not a business requirement, and inventing a business need for it would
be exactly the kind of dishonesty this document is trying to avoid. A single-engine platform —
Spark Structured Streaming alone, or Flink with its batch execution mode alone — would be a
defensible production choice for a system this size, and the added operational surface of two
engines, two build systems, and two state models is a real cost that a real team would weigh
differently.

Having said that plainly, there is a second reason that is genuine and that turns the redundancy
into the correctness story rather than an excuse for it: **the batch path is the reference
implementation for the streaming path.** The same aggregate — say, net revenue per marketplace
category per hour — is computed twice: once by Flink from the live stream with watermarks and late
handling, once by Spark from the immutable raw zone with full history and no time pressure. A
scheduled reconciliation job compares them for a closed interval and publishes the divergence.

That comparison is the single most valuable artefact this project can produce, because it is the
only way to prove a streaming aggregation is correct rather than merely running. It requires both
engines. The breadth motive and the correctness motive happen to point the same way; the breadth
motive came first and is disclosed.

### 5.4 The split as a rule

One rule governs new work: **if a consumer needs the answer before the event-time window can close,
it is a Flink job; otherwise it is a Spark job or a dbt model.** Latency requirement is the only
admissible reason to choose streaming. "It felt more modern" is not, and neither is "the data
arrives continuously" — all data arrives continuously.

---

## 6. Delivery semantics, watermarks, and what completeness means

### 6.1 The honest end-to-end guarantee

The producer is at-least-once. Kafka is at-least-once. Flink checkpoints give exactly-once _state_.
The sinks vary. Composing these does not yield exactly-once end to end, and claiming it would be
false. What the platform promises instead:

> Every published dataset is **idempotent and restatable**. Reprocessing the same input interval
> produces the same output, replacing rather than appending. Duplicate delivery of an event cannot
> change a published number, because deduplication is keyed on `event_id` and every write is a
> partition replacement rather than an append.

This is weaker than exactly-once and stronger in the way that matters: it survives operator error,
replay, and upstream resends, none of which exactly-once semantics protect against.

Mechanically: Flink checkpointing with aligned barriers; Kafka transactional sinks where the
downstream is Kafka; Iceberg commits scoped to a checkpoint where the downstream is a table; and
deduplication on `event_id` with a state TTL bounded by the maximum tolerated out-of-orderness.
Batch deduplication is unbounded and authoritative, which is the reason the batch path wins any
disagreement.

### 6.2 Watermarks

Watermarks derive from `occurred_at` with bounded out-of-orderness. The bound is a **parameter per
topic**, recorded in the topic's configuration alongside its schema pin, and it is set from a
measured distribution of `recorded_at − occurred_at` on the fixture — not chosen by intuition. The
measurement method is part of the deliverable: a Spark job over the raw zone emits the percentiles
of producer lag per topic, and the watermark bound is set at a stated percentile of that
distribution. The percentile chosen is a tradeoff, stated per topic, between output latency and the
fraction of events that arrive late.

Idle-partition handling is mandatory. A quiet Kafka partition must not hold the watermark back and
stall every window in the job; sources are configured with an idleness timeout, and the timeout is
itself a documented parameter because setting it too low advances the watermark past events that
were merely delayed.

### 6.3 Late data

Three tiers, and every record lands in exactly one:

- **On time** — `occurred_at` is ahead of the watermark. Processed normally.
- **Late but within allowed lateness** — the window has fired but not yet been purged. The window
  refires and emits an updated result. Downstream sinks must therefore accept updates, which is why
  every streaming output is an upsert keyed on the window identity rather than an append.
- **Too late** — beyond allowed lateness. Side-output to a `late-events` topic and archived. These
  records are _not_ dropped, and they are _not_ silently folded in. They are counted, and the count
  per dataset per interval is a published quality metric. They enter the published numbers only via
  the batch restatement, which reads the raw zone and therefore sees them regardless of how late
  they were.

The design explicitly refuses the common shortcut of infinite allowed lateness. Unbounded lateness
means unbounded state and windows that can never be declared closed, which destroys the finality
marker below.

### 6.4 What the platform promises about completeness

Every partition of every published dataset carries an explicit completeness state, materialised as a
column and exposed in the dataset's metadata:

- `provisional` — produced by the streaming path, watermark has passed, allowed lateness has not
  expired. May change. Safe for operational dashboards; not safe for a reported figure.
- `sealed` — allowed lateness has expired. The streaming path will not change it further.
- `final` — the batch restatement has run over the interval from the raw zone and replaced the
  partition. Reconciliation against the streaming result has been computed and recorded. This is the
  only state analysts and model builders are permitted to read.

A consumer that reads `provisional` data and reports it as a fact has made a choice the platform
made visible. A consumer that only reads `final` gets numbers that do not move. The convergence
bound — the maximum wall-clock delay from `occurred_at` to `final` — is a target in Section 13 with
a stated measurement method, not a promise already kept.

---

## 7. Modelling layers and the contract each one offers

dbt models everything downstream of the landing tables. The layering is not decoration; each layer
exists to absorb a specific kind of change so that it does not reach the next one.

### 7.1 Sources

Declared over the raw landing tables and the Flink output tables. Each source declares a freshness
threshold, which is the mechanism by which an upstream breakage in Section 3.4 becomes a visible
failure. Nothing except staging models may reference a source.

**Contract offered:** none. Sources are shaped by the producer and by Kafka mechanics, and their
shape can change without notice.

### 7.2 Staging (`stg_`)

Exactly one staging model per source stream. Permitted operations: rename, cast, coerce timestamps
to UTC, flatten the envelope, deduplicate on `event_id`, and filter out dead-lettered records. No
joins. No business logic. No filtering on business meaning.

**Why the restriction matters:** staging is where the upstream's vocabulary is translated into the
platform's vocabulary, and it is the only place that knows the producer's field names. When
CommerceFlow renames a field, exactly one model changes. If staging were allowed to join, that
blast radius would be unbounded.

**Contract offered to consumers (internal only):** stable column names and types, one row per
distinct `event_id`, UTC timestamps, deduplicated. Materialised as views where volume allows and
incrementally where it does not, with the incremental predicate keyed on ingest partition so that a
rerun of an interval is idempotent.

### 7.3 Intermediate (`int_`)

Joins, unions across event versions during a migration window, sessionisation fill-ins, pivots, and
the awkward reshaping that real models need and that nobody should have to look at.

**Contract offered: deliberately none.** This layer is not exposed, not documented for external use,
and may be restructured freely. That freedom is the layer's purpose: it is the shock absorber
between a source shape that changes for upstream reasons and a mart shape that must not change for
consumer reasons. A platform without this layer ends up with marts that encode upstream accidents.

### 7.4 Marts (`fct_`, `dim_`)

The only layer any external consumer may query. Facts at a declared grain; dimensions with SCD Type
2 history where the attribute changes over time and a consumer might need the value as of a past
date.

**Contract offered, and enforced:**

- **Grain is declared and tested.** Every fact table states its grain in one sentence and has a
  uniqueness test on the grain key. An untested grain claim is not a contract.
- **Column types and nullability are enforced**, using dbt's model contracts, so a change that would
  alter a published column's type fails at build time rather than at a consumer's dashboard.
- **Column semantics are documented**, including units and the definition of every derived measure.
  "Revenue" states whether it is gross, net of refunds, and whether tax and shipping are included.
- **Completeness state is exposed**, per Section 6.4, so consumers can filter to `final`.
- **Breaking changes go through model versioning** with a deprecation window during which both
  versions build. The old version is removed only after the window closes.
- **Freshness has a declared target** and a test that fails when it is missed.

### 7.5 Metrics

Metric definitions sit above marts so that "conversion rate" has exactly one definition and every
consumer — dashboard, API (DE-15), or feature pipeline — resolves to the same SQL. A metric that
can be computed two ways is the root cause of most of the disagreement described in Section 1.

### 7.6 What dbt does not do

dbt does not orchestrate Flink, does not move data into the warehouse, and does not own ingestion.
It transforms tables that already exist. Pushing ingestion into dbt is a common shortcut that makes
lineage incomplete precisely at the boundary where it matters most.

---

## 8. Orchestration

Airflow schedules, sequences, and records. It does not compute. Every task is a thin launcher for
work that runs elsewhere — a Flink job submission, a Spark submit, a dbt invocation — and every task
is parameterised by the data interval rather than by wall-clock time.

Rules, each of which exists because its absence causes a specific known failure:

- **No task reads the current time.** All reads are bounded by the run's data interval. A lint rule
  in CI forbids `datetime.now()`, `current_date`, and equivalents inside DAG and job code, because a
  task that reads the clock cannot be backfilled correctly.
- **Task outputs are atomic.** A task either replaces its target partition completely or leaves it
  untouched. Partial writes are the mechanism by which a retry becomes a double count.
- **Retries are safe by construction, not by luck.** Because outputs are partition replacements,
  retrying a task is always safe. This is asserted by a test that runs a representative task twice
  and diffs the output.
- **Streaming jobs are not scheduled.** Flink jobs run continuously; Airflow supervises their
  lifecycle (deploy, savepoint, restore) and monitors lag, but does not "run" them on a schedule.
  Conflating the two is a common and confusing error.
- **Concurrency is bounded.** `max_active_runs` and pool assignment are declared per DAG so a
  thirty-day backfill cannot saturate the cluster and starve the scheduled work.
- **Sensors are deferrable or absent.** A blocking sensor holding a worker slot for hours is a
  self-inflicted outage.

DE-05 goes deeper on idempotent backfill mechanics; DE-01 states the rules and demonstrates them on
the spine.

---

## 9. Data quality

Quality assertions are grouped by what they can detect, because a suite that is all row-count checks
gives false confidence.

- **Schema** — the record decodes against the pinned reader schema; required envelope fields are
  present; types match. Detects upstream contract violations.
- **Freshness** — the newest `occurred_at` in a dataset is within its declared threshold. Detects
  stalled pipelines, stalled producers, and the "pinned to an old major and now stale" case from
  Section 3.3.
- **Volume** — row count per interval falls within a band derived from the dataset's own history.
  Detects partial loads and silent upstream drops. The band is computed, not hand-set, and the
  computation is part of the deliverable.
- **Distribution** — key categorical proportions and numeric percentiles shift by less than a stated
  amount. Detects semantic changes that pass schema checks, which is the failure mode schema checks
  are worst at.
- **Referential integrity** — every fact's dimension key resolves. Detects join-time data loss and
  out-of-order arrival being mishandled.
- **Business rules** — order totals equal the sum of their lines; refunds never exceed the original
  charge; no event's `occurred_at` precedes its entity's creation. Detects logic errors in the
  models themselves.
- **Reconciliation** — the Section 5.3 comparison between the streaming and batch computations of
  the same aggregate. Detects watermark and lateness misconfiguration, which nothing else will.

Severity is two-valued and meaningful. An `error` assertion blocks promotion: the partition does not
reach `final` and downstream models do not build. A `warn` assertion is recorded in the run report
and does not block. Every assertion states its threshold in the report alongside the observed value,
so a reviewer can see _how close_ a passing check came to failing — a suite reporting only pass/fail
hides degradation until it is a failure. DE-07 builds the gatekeeper properly; DE-01 embeds enough
of it for the evidence bundle to mean something.

---

## 10. Backfill and reprocessing

The requirement: rebuild any interval of history, at any time, without double-counting and without
making live consumers read a half-written table.

**The raw zone is the only replay source.** Backfills never replay through Kafka into the streaming
jobs. Replaying into a stateful streaming job with live state is how duplicates are created, and the
watermark semantics of replayed history are not the semantics of live data — an hour of history
injected in thirty seconds produces window firing behaviour that does not resemble anything real.

**Backfills are always Spark jobs**, reading the raw zone for the interval, deduplicating on
`event_id` over the full interval rather than a bounded state window, computing the result, and
committing an atomic partition replacement.

**Partition replacement, not append.** Every derived table is partitioned on a deterministic
function of `occurred_at`, and a backfill of an interval replaces exactly the partitions that
interval covers. Double-counting is therefore structurally impossible rather than something a
careful engineer avoids. Iceberg's snapshot isolation means readers see either the old partition or
the new one, never a mixture.

**Determinism is tested, not assumed.** A CI job recomputes a fixed fixture interval twice and
asserts output equality under a canonical ordering. Non-determinism — an unstable sort, a
`current_timestamp` in a model, a hash seeded by partition count — is caught here rather than
discovered when two backfills disagree.

**The restatement ledger.** Every backfill writes a row recording dataset, partition, run id,
triggering reason, and the run id it supersedes. Any published number can be traced to the run that
produced it, and any change to a previously published number has a recorded cause. Numbers that
change without explanation are the fastest way to lose a consumer's trust; this is the cheapest
possible defence.

**Late data and backfill interact by design.** Events too late for the streaming path (Section 6.3)
are already in the raw zone. The scheduled restatement that promotes a partition to `final` picks
them up automatically. No separate late-data reconciliation process is needed, and the difference
between the provisional and final numbers is exactly the contribution of late and corrected data —
which is itself worth publishing.

---

## 11. Lineage and quality as publishable evidence

This is the section that distinguishes DE-01 from a tutorial stack, and it is the section most
likely to be skipped under time pressure. It should not be.

### 11.1 What is captured

**Lineage** via OpenLineage, emitted from all four ecosystems so the graph does not break at a
language boundary:

- Flink jobs emit job-level lineage: input topics, output tables, job version, checkpoint
  configuration.
- Spark jobs emit job- and column-level lineage through the OpenLineage Spark listener.
- dbt emits dataset- and column-level lineage derived from its manifest, including test results
  attached to the datasets they assert on.
- Airflow emits run-level lineage tying each task to the job it launched and the interval it
  covered.

Collected into a lineage store; the value is the **column-level path from a mart column back to the
Kafka topic and the upstream schema field that produced it**, crossing three engines. A lineage
graph that stops at "dbt read a table" is not evidence of anything.

**Quality**: every assertion run emits a structured result — assertion name, dataset, partition,
severity, threshold, observed value, verdict, run id, commit SHA.

**Environment**: commit SHA, container image digests, engine versions, fixture generator version and
dataset hash, machine CPU and memory, run count. Per platform PRD 9.2, a measurement without its
environment is not a measurement.

### 11.2 Where it is published

Evidence is generated, not written, and committed under `evidence/runs/<run-id>/`:

| Artefact              | Contents                                                               |
| --------------------- | ---------------------------------------------------------------------- |
| `environment.json`    | commit SHA, image digests, engine versions, dataset hash, machine spec |
| `quality.json`        | every assertion with threshold, observed value, and verdict            |
| `lineage.json`        | the OpenLineage graph for the run, column-level where available        |
| `reconciliation.json` | streaming-versus-batch divergence per aggregate and interval           |
| `freshness.json`      | measured `occurred_at`-to-queryable latency percentiles per dataset    |
| `restatements.json`   | the ledger rows written by the run                                     |
| `determinism.json`    | the double-run diff result for the fixture interval                    |

A static site renders the lineage graph, the dbt documentation, and the run index. Portfolio
evidence entries in `content/projects/DE-01.json` link to specific run URLs — not to a repository
root, because "the code is on GitHub" is not evidence.

### 11.3 What a reviewer can check, without running anything

The test of this section is whether a stranger can falsify a claim in ten minutes:

1. Open a run's `environment.json` and confirm the commit SHA matches the tag, the dataset hash
   matches the generator's declared output, and the machine is named.
2. Open `quality.json` and confirm assertions have thresholds, that the suite covers all seven
   categories in Section 9, and that a failing run exists in the history — a project with no
   recorded failures has either a trivial suite or a hidden one.
3. Follow one mart column backwards in the lineage graph to the Kafka topic and the upstream schema
   field, crossing the dbt, Spark, and Flink boundaries without the path breaking.
4. Open `reconciliation.json` and see the actual divergence between the streaming and batch
   computations of the same aggregate, with the tolerance stated separately from the observation.
5. Confirm every published figure is labelled synthetic and names its fixture.
6. Pick a partition, find it in `restatements.json`, and see why its number changed.

If any of those six cannot be done, this project has not reached `measured` regardless of what the
manifest says.

---

## 12. Repository layout

### 12.1 The problem the layout has to solve

`signallake` hosts DE-01 and the fourteen focused exhibits DE-02..DE-15. It contains four ecosystems
with irreconcilable conventions: JVM Flink jobs (Gradle, `src/main/java`), Spark jobs (Python, a
`pyproject.toml` workspace), dbt (its own project structure that dbt's tooling assumes), and Airflow
DAGs (a flat, importable directory the scheduler parses). None of these can be forced into the
others' shape without fighting its tooling daily.

Two organising principles are in tension. **By ecosystem** gives each build tool the layout it
expects but scatters one exhibit across four directories. **By exhibit** keeps an exhibit's work
together but breaks every build tool. The resolution adopted here: **physical layout follows the
build tools; logical layout follows the exhibits; a manifest binds them and CI reconciles the two.**

### 12.2 The tree

```text
signallake/
├── README.md
├── Makefile                      # single facade over four build systems
├── contracts/                    # the shared spine; no code, only schemas
│   ├── marketplace/              # VENDORED from commerceflow, pinned
│   │   ├── v1/
│   │   │   ├── order_placed.avsc
│   │   │   ├── payment_authorised.avsc
│   │   │   └── ...
│   │   └── v2/
│   ├── internal/                 # SignalLake-owned schemas (late-events, DLQ, ledger)
│   ├── fixtures/                 # golden event instances per type per version
│   └── registry/
│       ├── pins.yaml             # subject → version → fingerprint
│       ├── compatibility.yaml    # required mode + watermark params per topic
│       └── ownership.yaml        # topic → owning exhibit
├── exhibits/                     # the logical index: one manifest per project
│   ├── DE-01.yaml
│   ├── DE-02.yaml
│   └── ... DE-15.yaml
├── jvm/                          # Gradle multi-project build
│   ├── settings.gradle.kts
│   ├── build-logic/              # convention plugins, dependency rules
│   ├── flink-core/               # serde, envelope, watermark strategies, lineage hooks
│   └── flink-jobs/
│       ├── de01-order-lifecycle/
│       ├── de03-sessionisation/
│       └── de08-anomaly-windows/
├── py/                           # Python workspace (Spark jobs + shared libs)
│   ├── pyproject.toml
│   ├── packages/
│   │   ├── signallake-common/    # config, paths, run ids, lineage emitter
│   │   ├── signallake-spark/     # session builder, Iceberg helpers, partition replace
│   │   └── signallake-quality/   # assertion runners and report serialisation
│   └── jobs/
│       ├── de01_reconciliation/
│       ├── de01_restatement/
│       ├── de05_backfill/
│       └── de10_point_in_time_features/
├── dbt/
│   └── signallake/
│       ├── dbt_project.yml
│       ├── models/
│       │   ├── staging/          # stg_<source>__<entity>.sql, one per source stream
│       │   ├── intermediate/     # int_<domain>__<transform>.sql, not exposed
│       │   └── marts/
│       │       ├── core/         # DE-01 owns: fct_orders, dim_listing, ...
│       │       ├── de06_warehouse/
│       │       └── de10_features/
│       ├── macros/
│       ├── tests/
│       └── seeds/
├── orchestration/
│   └── airflow/
│       ├── dags/
│       │   └── generated.py      # iterates exhibits/*.yaml; instantiates via factory
│       ├── factories/            # DAG factories: streaming supervision, batch, dbt
│       ├── plugins/
│       └── tests/                # DAG-integrity and ownership tests
├── platform/                     # docker compose: Kafka, registry, Flink, MinIO, Marquez
├── generator/                    # synthetic CommerceFlow-shaped event generator
├── evidence/
│   ├── runs/<run-id>/            # generated bundles (Section 11.2)
│   └── index.json
├── tools/
│   ├── ci/                       # boundary checks, ownership reconciliation, pin diff
│   └── codegen/                  # Avro → Java and Avro → Python type generation
└── docs/
    ├── adr/
    └── runbooks/
```

### 12.3 Module contracts

Each module states what it owns, what it may depend on, and what it must never import. The third
column is the one CI enforces, and it is the one that actually shapes the codebase.

**`contracts/`** — owns event schemas, pins, golden fixtures, and per-topic parameters. Depends on
nothing. Must never import anything, contain code, or reference a runtime; it is read by the
codegen step and by every ecosystem's test suite, and if it ever gains a dependency it stops being
the neutral spine.

**`exhibits/*.yaml`** — owns the logical binding: for one exhibit, which JVM modules, Python job
packages, dbt selectors, DAG definitions, and topics belong to it, plus its owner and its evidence
targets. Depends on nothing. Must never contain logic; it is data read by CI and by the DAG
generator.

**`jvm/flink-core`** — owns envelope deserialisation, watermark strategies, dedup operators,
Iceberg sink configuration, and lineage emission. May depend on generated contract types. Must never
import a job module, reference an exhibit id, or contain business logic — the moment it knows about
`de03`, every other job inherits `de03`'s release cadence.

**`jvm/flink-jobs/*`** — each owns one job's topology and its business logic. May depend on
`flink-core` and generated types. **Must never depend on a sibling job.** Shared code between two
jobs is promoted into `flink-core` or a new shared module through a reviewed change, not reached
across.

**`py/packages/*`** — own the shared Python libraries. May depend on each other in a declared
layering (`common` ← `spark` ← `quality`). Must never import from `py/jobs/*`, never from
`orchestration/`, and never from `dbt/`. A library importing an application is the inversion that
makes a monorepo unbuildable in pieces.

**`py/jobs/*`** — each owns one Spark job's entrypoint and logic. May depend on `py/packages/*`.
**Must never import a sibling job**, must never import Airflow (a job that imports the orchestrator
cannot be run by hand, which is exactly what a debugging engineer needs at 2am), and must never
read the wall clock.

**`dbt/signallake/models/staging`** — owns source-to-platform translation. May reference sources
only. Must never reference another staging model, an intermediate model, or a mart.

**`dbt/signallake/models/intermediate`** — owns reshaping. May reference staging and intermediate.
Must never reference a source directly or a mart. Referencing a source here would bypass the
deduplication and typing that staging guarantees.

**`dbt/signallake/models/marts`** — owns the consumer contract. May reference staging and
intermediate. Must never reference a source directly, and a mart in one exhibit's subdirectory must
never reference another exhibit's mart except through the `core/` marts DE-01 owns. `core/` is the
shared vocabulary; exhibit marts are leaves.

**`orchestration/airflow/factories`** — owns DAG construction primitives. May depend on
`signallake-common` for paths and run ids. Must never import a job's internals; it launches
processes and reads exhibit manifests, nothing more.

**`orchestration/airflow/dags`** — owns nothing but instantiation. Contains no business logic and no
per-exhibit conditionals.

**`generator/`** — owns synthetic event production conforming to `contracts/`. May depend on
contracts and `signallake-common`. Must never import a job, a model, or the platform's outputs —
a generator that knows what the pipeline expects will produce data that flatters it.

**`evidence/`** — owns nothing hand-written. Generated only; CI fails on a hand-edited bundle.

### 12.4 Where shared event schemas live, and why there

In `contracts/`, at the repository root, outside every ecosystem. The alternatives were considered
and rejected: putting the schemas inside the Gradle build makes Python and dbt reach into a JVM
directory; publishing them as a Maven artefact makes the Python side depend on a JVM release cycle;
duplicating them per ecosystem guarantees drift. A root-level, code-free directory is the only
location all four tools can read without inverting a dependency.

Language types are **generated**, not hand-written: `tools/codegen` produces Java classes into the
Gradle build directory and Python dataclasses into `signallake-common`, both regenerated in CI with
a clean-diff assertion. Hand-written mirrors of a schema drift silently and are the classic source
of a field that means one thing in Flink and another in Spark.

### 12.5 Why dbt is layered this way

The three-layer split is not convention for its own sake; each boundary absorbs a specific change.
Staging absorbs **upstream vocabulary changes** — when CommerceFlow renames a field, one model
changes. Intermediate absorbs **modelling churn** — reshaping that would otherwise be duplicated
across marts or leak upstream shape into a published contract. Marts absorb **nothing**, by design:
they are the frozen surface, and their stability is the product. Collapsing staging into marts (the
common two-layer shortcut) means an upstream rename propagates directly into a published column
name, which is precisely the failure Section 3 exists to prevent.

Exhibit marts live in subdirectories under `marts/` rather than in separate dbt projects because
cross-project `ref` in dbt is awkward and because the lineage graph must stay connected — a
disconnected lineage graph would gut Section 11. The cost is that all exhibits share one dbt project
and therefore one build; the mitigation is selector-based builds, where an exhibit's CI job runs
`dbt build --select tag:de07+` rather than the whole project.

### 12.6 Where DAGs live relative to the jobs they orchestrate

DAGs live in `orchestration/`, not beside their jobs. This is the deliberate inversion of "keep
related things together", for three reasons. Airflow's scheduler parses one DAG directory and
scattering DAGs means symlink trees or an import shim. A DAG that lives beside its job invites
importing that job's internals, which makes the job unrunnable outside Airflow. And the orchestrator
is a cross-cutting concern: the same DAG factory schedules a Flink deployment, a Spark submit, and a
dbt selector, so it cannot belong to any one of them.

The binding is `exhibits/DE-NN.yaml`, which names the jobs a DAG launches. The DAG references jobs
by **identifier**, resolved to a submit command at runtime — never by import.

### 12.7 How an exhibit adds a pipeline without editing the keystone's

This is the property that determines whether fifteen projects can share one repository.

To add DE-07's quality gatekeeper pipeline, an author:

1. Adds `exhibits/DE-07.yaml` declaring owned paths, topics, dbt selector tag, DAG ids, and
   schedule.
2. Adds `py/jobs/de07_gatekeeper/` and, if streaming is needed, `jvm/flink-jobs/de07-*/`.
3. Adds `dbt/signallake/models/marts/de07_gatekeeper/`, tagged `de07`, referencing `core/` marts.
4. Runs `make exhibit-check DE-07`.

They edit **no keystone file**. No DAG file is modified, because `dags/generated.py` iterates the
manifests and instantiates through a factory. No `dbt_project.yml` change is needed, because model
configuration is path-based. No Gradle `settings.gradle.kts` edit is needed, because the build
discovers job modules under `flink-jobs/`. No Python workspace edit is needed, because job packages
are globbed.

The corresponding restriction: an exhibit may not modify `contracts/`, `core/` marts,
`flink-core`, `py/packages/*`, or another exhibit's paths without that change being reviewed as a
shared-spine change. The ownership check in CI enforces this against the manifest.

### 12.8 Enforcing boundaries mechanically

Conventions in a README decay by the third exhibit. Each rule above maps to an executable check.

| Boundary                              | Mechanism                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| JVM sibling-job isolation             | Gradle convention plugin fails on project dependencies between `flink-jobs/*`     |
| JVM layering and package rules        | ArchUnit tests in `flink-core` asserting no job or exhibit reference              |
| Python layering and forbidden imports | `import-linter` layered and forbidden contracts in `py/pyproject.toml`, run in CI |
| Jobs importing the orchestrator       | `import-linter` forbidden contract: `py.jobs.*` may not import `airflow`          |
| Wall-clock reads                      | AST-based lint rejecting `datetime.now`, `current_date` in jobs and DAGs          |
| dbt layer references                  | `tools/ci` walks `manifest.json`; verdict from the `ref` graph and path prefixes  |
| dbt cross-exhibit mart references     | same walk: a mart outside `core/` may not `ref` another exhibit's mart            |
| Grain and contract claims             | dbt model contracts plus a required uniqueness test per declared grain            |
| DAG ownership and id prefixes         | DAG-integrity test imports every DAG, asserts id prefix matches its manifest      |
| Path ownership between exhibits       | `tools/ci/check_ownership.py` diffs changed paths against `exhibits/*.yaml`       |
| Contract pins                         | build fails if any schema fingerprint differs from `pins.yaml`                    |
| Generated code and evidence           | regenerate in CI; fail on a non-empty diff                                        |
| Schema vendoring drift                | scheduled job diffs the live registry against pins and opens a report PR          |

A rule without a check in this table is not a rule; it is a wish, and it should be deleted from the
document rather than left as decoration.

### 12.9 The tradeoff being accepted

**Two indexes over the same files can drift, and the polyglot monorepo is slow.**

The physical tree is organised for build tools and the logical index (`exhibits/*.yaml`) is organised
for projects. Nothing stops someone adding a job and forgetting its manifest entry. The mitigation is
reconciliation in CI — every owned path must appear in exactly one manifest, and every manifest path
must exist — but that is custom code this project must write and maintain, and it is one more thing
that can be wrong.

The second cost is honest and unfixable: four build systems means no single `build` command, a
`Makefile` facade that is a leaky abstraction, slower CI than any single-ecosystem repository, and a
higher onboarding cost. A contributor wanting to change one dbt model must still have a working
Gradle and Python toolchain to run the full check.

The alternative — four repositories — was rejected because it would sever the lineage graph at the
repository boundary and make cross-engine reconciliation (Section 5.3) a multi-repo release dance.
Since lineage and reconciliation are the exhibit's entire differentiator, the monorepo cost is the
correct one to pay. The dbt single-project decision (12.5) is the same trade in miniature.

---

## 13. Targets and budgets

**None of these has been measured.** Each is an acceptance threshold with the method by which it
will be measured, and each must be recorded alongside the environment described in Section 11.1
before it counts. All are against a named synthetic fixture on a named machine.

| Target                                          | Threshold                               | Measurement method                                                                                                      |
| ----------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Streaming freshness, `occurred_at` to queryable | p95 budget, stated per dataset          | Trace events injected at a known emit time and sampled once per minute; percentiles over a 30-minute steady state       |
| Sustained ingest on the reference fixture       | budget per task slot                    | Generator emit count versus Kafka consumer lag over 30 minutes of steady state, lag non-increasing                      |
| Streaming-versus-batch divergence               | relative tolerance ε per aggregate      | Reconciliation job over a closed fixture interval; absolute and relative divergence recorded per aggregate and interval |
| Time to `final` (convergence bound)             | wall-clock budget from interval close   | Restatement run timestamps versus interval end, per partition, over the fixture period                                  |
| Error-severity quality assertions               | 100% pass before promotion              | Assertion runner output; a failure blocks the `final` transition and is recorded                                        |
| Late-event fraction                             | budget per topic                        | Count of side-outputted late events over total, per interval                                                            |
| Dead-letter rate                                | budget per topic                        | Dead-letter topic count over total consumed                                                                             |
| Backfill of a fixture month                     | wall-clock budget                       | End-to-end Spark backfill on the reference machine, median of three runs                                                |
| Determinism                                     | byte-identical under canonical ordering | Double-run diff of a fixed interval in CI                                                                               |
| Lineage completeness                            | 100% of marts resolve to a source topic | Automated walk of the lineage graph from every mart column                                                              |

Rules on reporting, inherited from platform PRD 0.10 and 9.2:

- Every figure is labelled synthetic and names its fixture and dataset hash.
- Every figure records commit SHA, image digests, engine versions, machine spec, and run count.
- Medians over repeated runs, never a best run.
- A missed target is published as a missed target. Thresholds are not edited to match observations;
  if a threshold was wrong, the revision is recorded with its reasoning and the old value.

---

## 14. Risks

- **The reconciliation harness is the whole thesis and is the most likely thing to be cut.** If it
  slips, the project reduces to a tool demonstration. It should be built early, on one aggregate,
  rather than late on many.
- **The event generator can flatter the platform.** A generator that never emits duplicates, never
  emits late events, and never emits a malformed record proves nothing. It must emit all three at
  configurable, recorded rates, and those rates belong in the evidence bundle.
- **Four ecosystems is genuinely a lot of maintenance surface** for one person. The mitigation is
  that `flink-core`, `py/packages`, and the CI checks are written once and the exhibits are thin.
  If exhibits stop being thin, the layout is wrong and should be revisited rather than endured.
- **Local resource limits will bound the throughput story.** A single machine running Kafka, Flink,
  Spark, and a warehouse will produce modest numbers. That is fine and must be stated as a property
  of the environment rather than hidden. The claim being made is about correctness and evidence, not
  scale.
- **Upstream DST-01 is itself `planned`.** Until CommerceFlow exists, the contract is specified from
  this side alone and the generator stands in for it. That asymmetry should be stated in the
  evidence bundle rather than papered over.

---

## 15. Moving from `code` to `measured`

The manifest records `proofLevel: code`. Platform PRD 5.x requires that `measured` be backed by at
least one metric with evidence, and Section 0.10 requires that synthetic figures be labelled and
carry their environment. Concretely, all of the following must exist before the manifest field is
changed:

**Runnable artefacts**

1. A one-command reproducible local stack (`platform/`) bringing up Kafka, schema registry, Flink,
   Spark, object storage, the warehouse, the lineage store, and Airflow.
2. The synthetic generator, with configurable and recorded rates for duplicates, late arrivals, and
   malformed records, plus a pinned fixture whose dataset hash is published.
3. At least one end-to-end Flink path: ingest → dedup → event-time window → Iceberg sink, with
   watermarks, allowed lateness, and late side-output wired and exercised.
4. At least one end-to-end Spark path: raw zone → deduplicated recomputation → atomic partition
   replacement.
5. The dbt project with all three layers populated, an enforced contract and tested grain on at
   least one fact and one SCD Type 2 dimension.
6. Airflow DAGs generated from exhibit manifests, parameterised by data interval, with a working
   backfill over the fixture.

**Measurements, each with its environment record**

7. A freshness report with measured percentiles per dataset against the stated budget.
8. A sustained-ingest report with the lag curve, over at least 30 minutes of steady state.
9. A reconciliation report showing measured streaming-versus-batch divergence per aggregate against
   the stated tolerance.
10. A quality report covering all seven assertion categories, with thresholds and observed values,
    including at least one recorded historical failure and its resolution.
11. A determinism report: the double-run diff over a fixed interval.
12. A backfill report: wall-clock duration over the fixture month, median of three runs.

**Publication**

13. An `evidence/runs/<run-id>/` bundle containing all seven artefacts from Section 11.2, generated
    by CI and not hand-edited.
14. A rendered lineage graph in which a reviewer can trace at least one mart column back to a Kafka
    topic and an upstream schema field across the dbt, Spark, and Flink boundaries.
15. A runbook covering job restart from savepoint, backfill invocation, and upstream-schema-break
    response.
16. Manifest updates: `status`, populated `stack`, a written `content.problem`, at least one
    `evidence` entry pointing at a specific run URL, and at least one `metrics` entry carrying
    `synthetic: true`, its environment string, its sample size, and its `measuredAt`.

Item 16 is what actually changes the proof level. Items 1–15 are what make item 16 defensible. The
proof level is not raised because the code exists; it is raised because a stranger can check a
number.

For completeness, `externally-validated` would additionally require an external artefact — an
accepted upstream contribution to one of the engines or their ecosystem, or a third-party review of
the reconciliation methodology. That is out of scope for this document.

---

## 16. Deltas against the current manifest

Flagged explicitly, per the rule that the manifest wins until it is edited. Everything below is
**beyond the current manifest** and is a proposal, not a record.

- `content.problem` is `null`. Section 1 specifies it.
- `stack` is empty in every category. This document implies Kafka, Avro and a schema registry,
  Flink, Spark, Iceberg, dbt, Airflow, OpenLineage/Marquez, Java, Python, SQL, Gradle, Docker
  Compose, Great-Expectations-style assertions, ArchUnit, and import-linter. None of that should be
  written into the manifest until it is actually in the repository.
- `evidence` and `metrics` are empty and must remain empty until Section 15 is satisfied.
- `capabilities` lists only `data`. The repository-layout, CI-enforcement, and contract-versioning
  content arguably also exercises `distributed-systems` and `system-design`; that is a vocabulary
  decision for the manifest owner, not this document.
- `dates` are all `null` and stay null until work starts.
- The upstream relationship to DST-01 is not represented in the manifest schema as a link; this
  document treats it as a first-class dependency, which may warrant a `relatedProjects` entry if the
  schema supports one.
- `proofLevel` stays `code`. Section 15 is the checklist for changing it.
