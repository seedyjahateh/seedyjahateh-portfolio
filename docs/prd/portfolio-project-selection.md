# Professional Portfolio Project Selection

**Target roles:** AI Engineer · Backend Engineer · Full Stack Engineer  
**Catalog size:** 239 selected projects · 16 tracks · 15 per track, except full-stack product (14 after the DST-01/FS-15 merge)  
**Purpose:** prove the competencies in `roadmap-v2.md` with original, inspectable, production-style work.

## Executive decision

Do not present 240 repositories as if they all have equal weight. Present one coherent engineering portfolio with three levels of evidence:

- **5 rotating GitHub pins:** the strongest role-relevant systems.
- **16 keystone projects:** one substantial case study per competency track, marked **★** below.
- **224 focused exhibits:** smaller products, benchmarks, failure drills, libraries, and from-scratch implementations that prove individual skills.

The website can show all 240 cards. The code should live in roughly **20–30 repositories**, with related exhibits grouped into track monorepos. This keeps the work browsable and avoids looking like a collection of tutorial forks.

## Recommended GitHub pin rotation

| Pin       | Project                                                | Primary hiring signal                                                     | Rotate for                        |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------- |
| 1         | **AtlasOps — Governed AI Knowledge Platform**          | RAG, agents, evals, model serving, safety, cost control                   | AI Engineer                       |
| 2         | **CommerceFlow — Event-Driven Marketplace**            | Java/Python/Go services, Kafka, Saga, Postgres, reliability               | Backend Engineer                  |
| 3         | **MoveTogether — Campus Mobility Network**             | polished Next.js UX, geospatial backend, real-time updates, accessibility | Full Stack Engineer               |
| 4         | **Reliability Forge — Kubernetes/SRE Lab**             | Terraform, GitOps, SLOs, incidents, security, load and chaos testing      | Backend / platform roles          |
| 5         | **SignalLake — Streaming Data and ML Platform**        | Flink/Spark/Airflow/dbt, feature pipelines, ranking, drift                | AI / backend roles                |
| Alternate | **SecureShare — Document Collaboration and Analytics** | secure uploads, permissions, WebSockets, auditability, product UX         | Full stack / security-heavy roles |

Each flagship should be an original product with a live demo, architecture narrative, benchmark/evaluation report, and a short demo video. Rotate the five visible pins to match the job rather than trying to make every visitor inspect the entire catalog.

## Legend

- **★ Keystone:** a major case study suitable for a role landing page.
- **Focused exhibit:** a smaller but complete proof of one engineering competency.
- Every line includes the evidence that makes the project credible; the title alone is not the deliverable.

---

## Track 1 — Systems, networking, and runtime engineering

**Primary roles:** Backend Engineer · AI infrastructure  
**Repository:** `systems-lab`

1. **SYS-01 ★ Concurrent HTTP Server in Go** — Implement HTTP/1.1 parsing, keep-alive, bounded workers, graceful shutdown, timeouts, and a benchmark against a standard server.
2. **SYS-02 TCP/IP Packet Journey Lab** — Parse Ethernet, ARP, IPv4, ICMP, and TCP packets; visualize retransmission, congestion, and handshake state from captured traffic.
3. **SYS-03 Recursive DNS Resolver** — Add TTL-aware caching, negative caching, concurrent lookups, observability, and tests against known DNS edge cases.
4. **SYS-04 TLS Handshake Explorer** — Decode a captured TLS 1.3 handshake, explain certificate validation, and compare session resumption latency without intercepting private traffic.
5. **SYS-05 Redis-Compatible Key-Value Store** — Build RESP parsing, TTLs, persistence, eviction, transactions, and pipelining; publish throughput and correctness results.
6. **SYS-06 Mini Relational Database** — Implement pages, a B+ tree, a query subset, WAL recovery, transactions, and a visual `EXPLAIN` plan.
7. **SYS-07 Log-Structured Storage Engine** — Build memtables, SSTables, compaction, Bloom filters, checksums, crash recovery, and write-amplification benchmarks.
8. **SYS-08 Durable Job Queue** — Support leases, visibility timeouts, retries, priorities, dead-letter handling, and recovery after worker termination.
9. **SYS-09 Java Concurrency Failure Museum** — Reproduce and fix deadlocks, races, starvation, lost updates, and unsafe publication with deterministic tests.
10. **SYS-10 Container Runtime Lite** — On Linux, isolate a process with namespaces and cgroups, apply resource limits, mount a root filesystem, and document the security boundary.
11. **SYS-11 Reverse Proxy and Load Balancer** — Add health checks, least-connections routing, circuit breaking, retries, connection pooling, and tail-latency benchmarks.
12. **SYS-12 Distributed Rate Limiter** — Compare token bucket, leaky bucket, fixed window, and sliding window implementations locally and with Redis coordination.
13. **SYS-13 Minimal Tracing SDK** — Propagate trace context across HTTP and queues, sample spans, export OTLP-compatible data, and quantify instrumentation overhead.
14. **SYS-14 Unix Shell with Job Control** — Implement pipelines, redirection, foreground/background jobs, signals, quoting, and integration tests.
15. **SYS-15 Bytecode Virtual Machine** — Build a lexer, parser, compiler, VM, garbage collector, debugger, and language conformance suite.

## Track 2 — Developer tooling and software craftsmanship

**Primary roles:** Backend Engineer · Full Stack Engineer  
**Repository:** `developer-toolbox`

1. **DEV-01 ★ Release-Grade Python Package** — Publish a typed library with `pyproject.toml`, semantic releases, compatibility tests, docs, CI, and a TestPyPI release.
2. **DEV-02 Spring Boot Service Generator** — Generate Clean Architecture modules, tests, OpenAPI, Docker assets, migrations, and CI from a validated specification.
3. **DEV-03 Go API Code Generator** — Generate typed handlers and clients from OpenAPI, preserve manual code safely, and prove determinism with golden tests.
4. **DEV-04 OpenAPI Breaking-Change Detector** — Classify contract changes, comment on pull requests, and provide migration guidance with fixture-based accuracy tests.
5. **DEV-05 Database Migration Linter** — Flag unsafe locks, table rewrites, missing rollback plans, and non-concurrent indexes for PostgreSQL migrations.
6. **DEV-06 Secret and Credential Scanner** — Combine entropy, patterns, allowlists, and commit-history scanning; report precision and recall on a labeled corpus.
7. **DEV-07 SBOM and License Inspector** — Produce CycloneDX output, detect risky licenses and vulnerable packages, and enforce configurable merge policies.
8. **DEV-08 Structured Logging Kit** — Provide Python, Java, and Go libraries with correlation IDs, redaction, sampling, JSON schemas, and cross-language examples.
9. **DEV-09 Reproducible Benchmark Harness** — Control warmup, concurrency, datasets, and confidence intervals; export comparable HTML reports.
10. **DEV-10 Feature-Flag SDK Trio** — Implement matching Python, Java, and TypeScript SDKs with deterministic bucketing, caching, offline fallback, and contract tests.
11. **DEV-11 GitHub Review Automation App** — Enforce repository-specific quality checks, summarize actionable failures, and maintain a complete audit trail.
12. **DEV-12 Local Code Search Engine** — Index repositories with lexical and semantic search, incremental updates, symbol filters, and evaluation queries.
13. **DEV-13 Cross-Platform Task Runner** — Build dependency-aware tasks, parallel execution, caching, cancellation, and cycle detection.
14. **DEV-14 Stateful API Mock Server** — Generate mocks from OpenAPI, model workflows and faults, record traffic safely, and support deterministic replay.
15. **DEV-15 Docs-as-Code Portal** — Generate versioned API and architecture docs, validate links and examples, and preview every pull request.

## Track 3 — API and backend product engineering

**Primary roles:** Backend Engineer · Full Stack Engineer  
**Repository:** `backend-platforms`

1. **API-01 ★ Polyglot Service Platform** — Implement one business workflow across FastAPI, Spring Boot, and Go; compare latency, concurrency, memory, and developer ergonomics.
2. **API-02 Multi-Tenant SaaS Core** — Build tenant isolation, invitations, RBAC, quotas, audit logs, metering, and safe administrative impersonation.
3. **API-03 OAuth 2.1/OIDC Integration Service** — Implement authorization code with PKCE using established libraries, key rotation, revocation, and security-focused integration tests.
4. **API-04 Notification Orchestrator** — Route email, SMS, push, and in-app messages with preferences, templates, rate limits, retries, deduplication, and delivery analytics.
5. **API-05 Secure Media Processing API** — Accept resumable uploads, validate content, scan files, transform asynchronously, and issue expiring download URLs.
6. **API-06 Webhook Delivery Platform** — Provide signed events, idempotency, exponential backoff with jitter, replay, endpoint health, and dead-letter recovery.
7. **API-07 Policy-Aware API Gateway** — Add authentication, quotas, routing, request validation, circuit breakers, correlation IDs, and live configuration reload.
8. **API-08 Usage Metering Service** — Ingest idempotent usage events, aggregate billable units, reconcile late data, and expose explainable customer statements.
9. **API-09 Link Management and Analytics** — Build custom domains, safe redirects, bot filtering, geographic aggregates, retention controls, and abuse prevention.
10. **API-10 Scheduling and Availability Engine** — Handle time zones, recurrence, buffers, conflicts, waitlists, cancellation policies, and concurrency-safe booking.
11. **API-11 Inventory and Catalog Service** — Model variants, warehouses, reservations, optimistic concurrency, low-stock events, and bulk imports.
12. **API-12 Geospatial Dispatch Service** — Match supply and demand using PostGIS, ETA estimates, fairness constraints, WebSocket updates, and load simulations.
13. **API-13 Collaborative Presence Backend** — Provide rooms, presence, cursors, reconnect semantics, authorization, event compaction, and horizontal scaling.
14. **API-14 Search and Autocomplete API** — Combine prefixes, typo tolerance, synonyms, ranking, personalization controls, and relevance evaluation.
15. **API-15 Job Intelligence API** — Normalize postings, deduplicate companies and roles, track changes, provide saved searches, and expose transparent ranking factors.

## Track 4 — Databases, caching, and search internals

**Primary roles:** Backend Engineer · AI Engineer  
**Repository:** `data-systems-lab`

1. **DB-01 ★ PostgreSQL Performance Clinic** — Curate slow production-shaped queries, diagnose them with `EXPLAIN ANALYZE`, apply indexes and rewrites, and publish before/after evidence.
2. **DB-02 Index Recommendation Assistant** — Analyze query plans and workload statistics, propose B-tree/GIN/partial indexes, and estimate write/storage tradeoffs.
3. **DB-03 Connection Pooling Proxy** — Build a small protocol-aware pooler with transaction/session modes, backpressure, health checks, and saturation tests.
4. **DB-04 Isolation Anomaly Laboratory** — Deterministically demonstrate dirty reads, non-repeatable reads, phantoms, write skew, and lost updates with fixes.
5. **DB-05 Change-Data-Capture Explorer** — Stream PostgreSQL changes through Debezium/Kafka, handle schema evolution and replay, and verify end-to-end ordering.
6. **DB-06 Schema Registry and Compatibility Service** — Version Avro/JSON/Protobuf schemas, enforce compatibility modes, and integrate with producers and consumers.
7. **DB-07 Data Lineage Catalog** — Trace datasets and fields across ingestion, dbt, APIs, and models; show ownership, freshness, and impact analysis.
8. **DB-08 Time-Series Telemetry Store** — Design partitions, retention, downsampling, compression, and queries for high-cardinality service metrics.
9. **DB-09 Vector Index Benchmark Lab** — Compare pgvector and Qdrant HNSW/IVF configurations on recall, latency, memory, ingestion, and filtering.
10. **DB-10 Cache Correctness Playground** — Demonstrate cache-aside, write-through, stampede protection, stale-while-revalidate, and invalidation failure modes.
11. **DB-11 Backup and Point-in-Time Recovery Drill** — Automate backups, restore to a target timestamp, verify integrity, and document measured RPO/RTO.
12. **DB-12 Tenant Isolation Testbed** — Compare schema-per-tenant, database-per-tenant, and row-level security with migration and noisy-neighbor tests.
13. **DB-13 Tamper-Evident Audit Ledger** — Create append-only events with hash chaining, signatures, retention, verification, and privacy-aware redaction.
14. **DB-14 Data Retention and Deletion Engine** — Enforce policy-based TTLs, legal holds, export, deletion propagation, and verifiable tombstones.
15. **DB-15 Search Relevance Workbench** — Tune BM25 analyzers, stemming, synonyms, field boosts, and offline relevance judgments for a real catalog.

## Track 5 — Distributed and event-driven systems

**Primary roles:** Backend Engineer · AI infrastructure  
**Repository:** `commerceflow`

1. **DST-01 ★ CommerceFlow Event-Driven Marketplace** — Integrate catalog, search, checkout simulation, order Saga, inventory, fulfillment, support, analytics, and a polished storefront over Python and Java services with Kafka, transactional outbox, idempotent consumers, compensations, and a failure-recovery demo.
2. **DST-02 Double-Entry Payment Ledger** — Model immutable journal entries, authorization/capture/refund states, reconciliation, idempotency, and invariant tests without moving real money.
3. **DST-03 Outbox and CDC Reference Implementation** — Compare polling and log-based CDC, crash at every boundary, and prove that events are neither lost nor double-applied.
4. **DST-04 Reliable Webhook Ingestion Gateway** — Verify signatures, deduplicate deliveries, preserve order per source, quarantine poison events, and replay safely.
5. **DST-05 Real-Time Marketplace Aggregator** — Compute inventory, conversion, and revenue windows with Kafka Streams/Flink and handle late or out-of-order events.
6. **DST-06 Priority Work Queue** — Use RabbitMQ for delayed jobs, retry tiers, priorities, cancellation, backpressure, and operational dashboards.
7. **DST-07 Horizontally Scaled Chat Service** — Add presence, typing, delivery/read state, offline replay, fan-out, and partition-tolerance tests.
8. **DST-08 Preference-Aware Notification System** — Coordinate channels and quiet hours while preventing duplicates across retries and regional workers.
9. **DST-09 Durable Workflow Engine** — Implement state machines, timers, retries, compensation, versioned workflows, and deterministic recovery from an event log.
10. **DST-10 Distributed Scheduler** — Provide leases, leader election, missed-run recovery, clock-skew handling, and exactly-once business effects via idempotency.
11. **DST-11 Leader Election and Membership Lab** — Implement heartbeats, failure detection, leases, split-brain scenarios, and a visual state timeline.
12. **DST-12 Replicated Key-Value Store with Raft** — Implement leader election, replicated logs, snapshots, partitions, and linearizability checks.
13. **DST-13 CQRS Customer Support Platform** — Separate write models and searchable read projections, rebuild projections, and quantify consistency lag.
14. **DST-14 Streaming Risk Signal Pipeline** — Correlate high-volume events, manage window state, emit explainable alerts, and replay a historical incident.
15. **DST-15 Multi-Region Configuration Service** — Distribute feature flags with version vectors, defined consistency, safe fallback, and regional failover experiments.

## Track 6 — Security, identity, and abuse resistance

**Primary roles:** Backend Engineer · Full Stack Engineer · AI Engineer  
**Repository:** `security-engineering-lab`

1. **SEC-01 ★ Threat-Modeled SaaS Platform** — Publish assets, trust boundaries, STRIDE threats, mitigations, abuse cases, penetration tests, and residual risk for API-02.
2. **SEC-02 OWASP Vulnerability-to-Fix Museum** — Build isolated vulnerable examples, exploit them safely, patch them, and add regression tests for major OWASP classes.
3. **SEC-03 RBAC/ABAC Policy Service** — Evaluate role and attribute policies, explain every decision, test privilege escalation, and cache without stale authorization.
4. **SEC-04 Short-Lived Secrets Broker** — Issue scoped temporary credentials, rotate and revoke them, log access, and demonstrate recovery from leaked test credentials.
5. **SEC-05 API Threat Detection Gateway** — Detect credential stuffing, enumeration, replay, injection patterns, and abnormal rates with explainable policies and false-positive tests.
6. **SEC-06 Software Supply-Chain Pipeline** — Generate an SBOM, scan dependencies and containers, sign artifacts, verify provenance, and block policy violations.
7. **SEC-07 Authentication Anomaly Detector** — Score impossible travel, device changes, velocity, and failed-login patterns; measure detection quality on synthetic labeled events.
8. **SEC-08 Envelope Encryption Service** — Use managed-key concepts, data-key rotation, authenticated encryption, access separation, and cryptographic test vectors.
9. **SEC-09 Secure File Intake Gateway** — Enforce MIME/content validation, size limits, antivirus scanning, archive-bomb defense, quarantine, and least-privilege storage.
10. **SEC-10 SSRF-Resistant Fetch Service** — Block private networks, redirects, DNS rebinding, unsupported schemes, and oversized responses; prove it with adversarial tests.
11. **SEC-11 Permission-Diff Analyzer** — Compare releases of IAM/RBAC policies, identify privilege expansion, show affected principals, and require review for risky changes.
12. **SEC-12 Audit Integrity Verifier** — Detect missing, reordered, modified, or replayed audit events and produce a human-readable investigation report.
13. **SEC-13 Adaptive Abuse Rate Limiter** — Combine identity, IP, device, endpoint cost, and reputation while protecting legitimate burst traffic.
14. **SEC-14 Dependency Risk Dashboard** — Prioritize vulnerabilities by reachability, exploitability, asset criticality, fix version, and compensating controls.
15. **SEC-15 Prompt-Injection Defense Gateway** — Separate trusted instructions from content, restrict tools, scan retrieved text, require approvals, and report attack success rates.

## Track 7 — Testing, quality engineering, and verification

**Primary roles:** All three roles  
**Repository:** `quality-engineering-lab`

1. **TST-01 ★ Production Test Pyramid Reference App** — Demonstrate unit, integration, contract, component, end-to-end, security, performance, and smoke tests with a rationalized CI pipeline.
2. **TST-02 Consumer-Driven Contract Suite** — Use Pact between Python, Java, and TypeScript services; detect breaking changes before deployment.
3. **TST-03 Property-Based Financial Invariant Tests** — Generate transaction histories and prove conservation, idempotency, and balance invariants for DST-02.
4. **TST-04 Mutation Testing Dashboard** — Run language-specific mutation tools, identify weak assertions, track mutation score, and highlight expensive tests.
5. **TST-05 API and Parser Fuzzing Lab** — Fuzz HTTP, JSON, file, and protocol parsers; minimize failures and turn every crash into a regression test.
6. **TST-06 Load and Capacity Test Studio** — Model realistic arrivals, warmup, spikes, soak, and saturation; report p50/p95/p99, errors, resources, and capacity limits.
7. **TST-07 Chaos Experiment Catalog** — Kill pods, delay networks, exhaust pools, corrupt messages, and fail dependencies with hypotheses, blast-radius controls, and findings.
8. **TST-08 Accessibility Conformance Harness** — Combine axe, keyboard journeys, focus checks, screen-reader notes, and manual WCAG 2.2 AA evidence.
9. **TST-09 Visual Regression System** — Capture stable Storybook and page snapshots across viewports, tolerate intended variance, and triage meaningful diffs.
10. **TST-10 Synthetic Production Monitor** — Run global user journeys, measure availability and latency, redact test data, and connect failures to traces.
11. **TST-11 Concurrency Race Harness** — Force interleavings with barriers and fault injection to reproduce races in reservations, counters, and caches.
12. **TST-12 Database Transaction Test Lab** — Verify locks, isolation, retries, deadlock handling, migrations, and rollback behavior against real PostgreSQL instances.
13. **TST-13 Event Replay Verifier** — Reprocess recorded event streams deterministically and compare projections, side effects, schema versions, and deduplication.
14. **TST-14 Canary Release Verifier** — Compare golden signals and business metrics between versions, enforce automatic rollback, and avoid low-sample decisions.
15. **TST-15 Privacy-Safe Test Data Factory** — Generate relationally consistent synthetic data, detect accidental PII, version datasets, and reproduce failed tests.

## Track 8 — Cloud, DevOps, platform engineering, and SRE

**Primary roles:** Backend Engineer · AI infrastructure  
**Repository:** `reliability-forge`

1. **OPS-01 ★ GitOps Kubernetes Production Environment** — Provision infrastructure with Terraform, deploy through GitHub Actions and Argo CD, enforce probes/limits/policies, and demonstrate rollback.
2. **OPS-02 AWS Landing Zone in Terraform** — Build modules for IAM, VPC, compute, storage, and RDS with least privilege, remote state, policy checks, and cost estimates.
3. **OPS-03 OpenTelemetry Observability Platform** — Correlate metrics, logs, and traces across polyglot services and publish a trace-led incident investigation.
4. **OPS-04 SLO and Error-Budget Control Center** — Define user-centered SLIs, multi-window burn alerts, release gates, and a documented 99.9% policy.
5. **OPS-05 Incident Command Simulator** — Inject a cascading failure, record decisions and communication, measure detection/mitigation/recovery, and publish a blameless postmortem.
6. **OPS-06 Autoscaling Benchmark** — Compare CPU, request, queue-depth, and custom-metric scaling under spikes; quantify cost, stability, and cold-start behavior.
7. **OPS-07 Canary Delivery Controller** — Shift traffic progressively, analyze golden signals, pause for approval, and roll back automatically on defined thresholds.
8. **OPS-08 Disaster-Recovery Automation** — Restore data and services in a clean region/account simulation, verify integrity, and report achieved RPO/RTO.
9. **OPS-09 Cloud Cost Attribution Portal** — Allocate shared costs by service/team/tenant, detect anomalies, recommend savings, and verify recommendations against usage.
10. **OPS-10 Secret Rotation Pipeline** — Rotate database and API credentials without downtime, detect stale consumers, revoke old versions, and audit completion.
11. **OPS-11 Multi-Region Failover Lab** — Define routing and data-consistency tradeoffs, test regional loss, measure recovery, and document failure modes.
12. **OPS-12 Signed Container Supply Chain** — Build minimal images, scan them, create SBOMs, sign artifacts, verify admission, and preserve provenance.
13. **OPS-13 Service-Mesh Reliability Lab** — Test mTLS, retries, timeouts, outlier detection, traffic splitting, and the latency/complexity cost of the mesh.
14. **OPS-14 eBPF Performance Investigation** — Diagnose a real CPU/network/syscall bottleneck with eBPF tools and validate the fix with repeatable benchmarks.
15. **OPS-15 Edge Cache and CDN Simulator** — Implement cache keys, revalidation, stale serving, invalidation, regional latency tests, and origin-protection limits.

## Track 9 — Frontend engineering and browser depth

**Primary roles:** Full Stack Engineer  
**Repository:** `frontend-engineering-lab`

1. **FE-01 ★ Accessible Design System** — Build tokenized themes, composable React components, Storybook docs, keyboard/screen-reader behavior, visual tests, and WCAG 2.2 AA evidence.
2. **FE-02 Rendering Strategy Laboratory** — Implement the same product view with CSR, SSR, SSG, ISR, streaming, and RSC; compare freshness, complexity, LCP, INP, and hydration.
3. **FE-03 Real-Time Operations Dashboard** — Visualize streaming events with pause/replay, resilient reconnects, accessible charts, and performance under sustained updates.
4. **FE-04 Collaborative Canvas** — Add multi-user cursors, optimistic updates, conflict handling, offline edits, keyboard interaction, and reconnection tests.
5. **FE-05 Conversational Form Renderer** — Generate accessible forms from a schema, support conditional logic and save/resume, and measure completion and error UX.
6. **FE-06 Core Web Vitals Clinic** — Start from a deliberately slow app, profile it, and document bundle, image, font, rendering, and interaction improvements.
7. **FE-07 High-Density Data Explorer** — Build virtualized tables, column pinning, filters, saved views, export, accessible navigation, and URL-synchronized state.
8. **FE-08 Offline-First Field App** — Support installability, background sync, conflict resolution, durable drafts, connectivity states, and safe update prompts.
9. **FE-09 Internationalized Commerce UI** — Handle locale routing, RTL, pluralization, dates, units, currencies, long text, and translated accessibility labels.
10. **FE-10 Virtualized Social Feed** — Maintain scroll position, prefetch, paginate, stream updates, avoid layout shifts, and measure memory and responsiveness.
11. **FE-11 Secure Authentication UX** — Implement passkeys-ready flows, MFA/recovery states, session visibility, CSRF-safe actions, and enumeration-resistant messages.
12. **FE-12 Experimentation Component Framework** — Assign variants deterministically, prevent flicker, expose typed hooks, capture guardrail events, and support kill switches.
13. **FE-13 Micro-Frontend Tradeoff Demo** — Integrate two independently deployed slices, share design tokens and auth, and quantify bundle/runtime/operational overhead.
14. **FE-14 Browser Task Extension** — Build a permission-minimal extension for tab/workflow organization with local-first storage and transparent privacy controls.
15. **FE-15 Frontend Error Recovery Gallery** — Demonstrate Suspense, error boundaries, retries, stale data, partial failure, optimistic rollback, and offline recovery.

## Track 10 — Full-stack commercial product engineering

**Primary roles:** Full Stack Engineer · Backend Engineer · AI Engineer  
**Repository strategy:** one repository per serious product; smaller products may share `product-studio`.

1. **FS-01 ★ MoveTogether Campus Mobility Network** — Build verified communities, ride matching, geospatial search, live trip state, safety workflows, notifications, moderation, and an accessible responsive client.
2. **FS-02 SecureShare Document Collaboration** — Add secure upload, granular access, expiring links, page analytics, comments, versions, watermarks, audit logs, and privacy controls.
3. **FS-03 Voice-to-Brief Studio** — Turn audio notes into structured drafts with transcripts, templates, editing, provenance, export, quality evaluation, and cost/latency dashboards.
4. **FS-04 Conversational Research Form Platform** — Provide visual form design, branching, response pipelines, analytics, collaboration, webhooks, and accessibility-first public forms.
5. **FS-05 StageControl Live Event Timer** — Synchronize presenter and audience displays, remote control, offline fallback, templates, roles, and sub-second state updates.
6. **FS-06 Verified Flexible-Work Job Board** — Normalize and verify listings, track policy changes, provide transparent fit filters and alerts, and resist scraped-content duplication.
7. **FS-07 Creator Commerce Platform** — Support digital products, storefronts, entitlements, coupons, tax-ready records, creator analytics, dispute workflows, and secure downloads.
8. **FS-08 Rapid Consumer Feedback Panel** — Match studies to participants, randomize options, collect structured feedback, control quality, and visualize confidence and bias.
9. **FS-09 Local Business Discovery Engine** — Build verified listings, faceted search, service areas, opening hours, owner updates, ranking transparency, and spam moderation.
10. **FS-10 Photo Restoration Workspace** — Offer non-destructive AI restoration, side-by-side review, batch jobs, version history, consent, deletion, and model limitations.
11. **FS-11 Personal Knowledge and Bookmark Vault** — Capture content, deduplicate, tag, search, summarize with citations, sync devices, export, and provide local/private modes.
12. **FS-12 Cross-Channel Inventory Bridge** — Synchronize SKUs and stock between mock commerce systems, resolve conflicts, reconcile drift, and expose operational controls.
13. **FS-13 Developer Challenge and Review Platform** — Host realistic briefs, test submissions safely, support peer review, show skill evidence, and prevent solution leakage.
14. **FS-14 Community Challenge Platform** — Run weekly creative challenges with submissions, moderation, voting integrity, notifications, badges, and accessible galleries.

> **FS-15 merged into DST-01 (2026-08-28).** "CommerceFlow Marketplace" and
> "Event-Driven Order and Inventory System" described one product from two
> sides, and the GitHub pin rotation listed a single CommerceFlow flagship. They
> are now one record under DST-01, which keeps the ID because it is the Track 5
> keystone and owns the `commerceflow` repository. This track therefore has 14
> entries and one open slot.

## Track 11 — Data engineering and analytics platforms

**Primary roles:** Backend Engineer · AI Engineer  
**Repository:** `signallake`

1. **DE-01 ★ SignalLake Streaming Data Platform** — Ingest marketplace events through Kafka, aggregate with Flink, batch with Spark, model with dbt, orchestrate with Airflow, and publish lineage and quality evidence.
2. **DE-02 PostgreSQL CDC Replication Pipeline** — Capture changes with Debezium, evolve schemas, deduplicate, replay, and validate source-to-sink consistency.
3. **DE-03 Product Clickstream Platform** — Define an event taxonomy, manage sessions and identities, process late events, and expose trustworthy funnel and retention tables.
4. **DE-04 Lakehouse Table Format Lab** — Compare Parquet plus Iceberg/Delta concepts for partitioning, compaction, snapshots, schema evolution, and time travel.
5. **DE-05 Idempotent Airflow Backfill System** — Build parameterized DAGs with retries, backfills, data intervals, atomic outputs, and safe partial reruns.
6. **DE-06 dbt Marketplace Warehouse** — Model facts, dimensions, SCD Type 2 history, incremental models, tests, documentation, and metric definitions.
7. **DE-07 Data Quality Gatekeeper** — Enforce schema, freshness, volume, distribution, referential integrity, and business rules before downstream promotion.
8. **DE-08 Real-Time Anomaly Stream** — Detect spikes, drops, missing partitions, and distribution shifts with event-time windows and explainable alerts.
9. **DE-09 Search Indexing Pipeline** — Transform source records into Elasticsearch/OpenSearch documents, handle updates and deletes, and support zero-downtime reindexing.
10. **DE-10 Recommendation Feature Pipeline** — Generate offline and online features from behavioral events, prevent leakage, and verify point-in-time correctness.
11. **DE-11 Data Contract Registry** — Let producers declare schemas, semantics, owners, SLAs, and compatibility; show downstream impact before changes merge.
12. **DE-12 PII Discovery and Governance Pipeline** — Classify sensitive fields, propagate tags through lineage, enforce masking, and audit policy decisions on synthetic data.
13. **DE-13 Pipeline Observability Console** — Track freshness, completeness, lineage, run duration, retries, cost, and incident history across batch and streaming jobs.
14. **DE-14 Feature Store Reference Stack** — Materialize consistent offline/online features, version definitions, monitor skew, and serve low-latency lookups.
15. **DE-15 Self-Service Analytics API** — Expose governed metrics with caching, row-level security, query limits, semantic definitions, and reproducible exports.

## Track 12 — Classical machine learning, ranking, and MLOps

**Primary roles:** AI Engineer · Backend Engineer  
**Repository:** `production-ml-lab`

1. **ML-01 ★ Marketplace Search Ranker** — Train XGBoost/LightGBM on leakage-safe features, track experiments, serve predictions, monitor drift, and design an A/B test with guardrails.
2. **ML-02 Transaction Risk Classifier** — Handle extreme class imbalance, calibrate probabilities, choose cost-sensitive thresholds, explain predictions, and monitor delayed labels.
3. **ML-03 Subscription Churn Model** — Compare logistic regression, boosting, and survival-style targets; define interventions without presenting correlation as causation.
4. **ML-04 Hierarchical Demand Forecaster** — Forecast SKU/location demand, use time-aware validation, quantify uncertainty, reconcile levels, and compare against seasonal baselines.
5. **ML-05 Mobility ETA Predictor** — Engineer route, time, traffic-like, and weather-like synthetic features; evaluate by segment and serve low-latency estimates.
6. **ML-06 Price-Response Experiment Model** — Estimate demand sensitivity on synthetic experiments, report uncertainty and segment effects, and avoid automated real-world price discrimination.
7. **ML-07 Service Metric Anomaly Detector** — Compare statistical thresholds, isolation forests, and autoencoder baselines on labeled incident windows and false-alert cost.
8. **ML-08 Support Ticket Triage Model** — Route, prioritize, and tag tickets with calibrated confidence, abstention, human review, fairness checks, and drift monitoring.
9. **ML-09 Near-Duplicate Content Detector** — Compare MinHash/LSH, TF-IDF, and embeddings for precision, recall, speed, memory, and incremental indexing.
10. **ML-10 Content Safety Classifier** — Build a transparent moderation aid with category-specific thresholds, appeal/human review, subgroup analysis, and a limitations card.
11. **ML-11 Imbalanced Classification and Calibration Lab** — Compare metrics, resampling, class weights, focal loss, Platt scaling, and isotonic calibration on multiple datasets.
12. **ML-12 Experiment Analysis Platform** — Perform power and sample-size planning, sequentially safe reporting, guardrail analysis, novelty checks, and segment diagnostics.
13. **ML-13 Uplift Modeling Simulator** — Estimate heterogeneous treatment effects on synthetic randomized data and compare treatment policies with honest validation.
14. **ML-14 Two-Tower Recommendation System** — Build candidate retrieval, hard-negative sampling, approximate-nearest-neighbor serving, offline metrics, and cold-start strategies.
15. **ML-15 Learning-to-Rank Search Stack** — Combine BM25 candidates, behavioral features, pairwise/listwise ranking, offline judgments, and online experiment design.

## Track 13 — Deep learning, transformers, and model serving

**Primary roles:** AI Engineer  
**Repository:** `model-engineering-lab`

1. **DL-01 ★ Autograd Engine and Neural Network Library** — Implement scalar/tensor operations, backpropagation, optimizers, gradient checks, training examples, and a written derivation.
2. **DL-02 Astronomical Image Classifier** — Build careful splits, augmentation, transfer learning, error analysis, uncertainty, and an experiment ledger tied to astro-imaging experience.
3. **DL-03 Document Layout and OCR Pipeline** — Detect regions, extract text and tables, preserve coordinates, evaluate by document type, and support human correction.
4. **DL-04 Speech Transcription and Diarization Service** — Segment audio, identify speakers, transcribe, timestamp, redact test PII, and report word/diarization error rates.
5. **DL-05 Visual Defect Detection System** — Compare classification, localization, and anomaly approaches under scarce labels, augmentation, and domain shift.
6. **DL-06 Time-Series Transformer Forecasting Lab** — Compare transformer, boosting, and statistical baselines with rolling validation and latency/cost analysis.
7. **DL-07 Multimodal Catalog Matcher** — Align image and text embeddings, retrieve duplicates/substitutes, evaluate hard negatives, and expose an explainable review tool.
8. **DL-08 Tokenizer Engineering Suite** — Implement BPE, train on domain corpora, inspect fertility and edge cases, and compare vocabulary, speed, and compression.
9. **DL-09 Small GPT from Scratch** — Implement attention, masking, position encoding, training, sampling, checkpoints, evaluation, and an interactive architecture explainer.
10. **DL-10 Domain LoRA Fine-Tuning Study** — Curate and version data, train LoRA/QLoRA adapters, compare against prompting/RAG baselines, and publish a model card.
11. **DL-11 Quantization Quality Lab** — Compare int8/int4 and GGUF/AWQ/GPTQ-style workflows on memory, throughput, latency, and task-quality regression.
12. **DL-12 vLLM Production Endpoint** — Serve an open model with continuous batching, streaming, quotas, autoscaling signals, OpenAI-compatible APIs, and load results.
13. **DL-13 Offline llama.cpp Assistant** — Run a quantized model locally with privacy controls, hardware-aware configuration, and benchmarks across context sizes.
14. **DL-14 Speculative Decoding Experiment** — Implement or integrate draft/target decoding, measure acceptance and speedup, and document when overhead loses.
15. **DL-15 Model Serving Gateway** — Route models by task, quality, latency, privacy, and cost; support fallbacks, batching, cache safety, and per-model SLOs.

## Track 14 — Retrieval, search, and production RAG

**Primary roles:** AI Engineer · Backend Engineer  
**Repository:** `atlasops`

1. **RAG-01 ★ AtlasOps Governed Knowledge Platform** — Ingest versioned sources, run hybrid retrieval and reranking, produce grounded answers, enforce access controls, evaluate quality, and observe cost/latency.
2. **RAG-02 Codebase Intelligence Assistant** — Index symbols, call graphs, docs, and history; answer with line-level citations, respect repository boundaries, and evaluate maintenance tasks.
3. **RAG-03 Incident Knowledge Assistant** — Retrieve runbooks, dashboards, deploys, and past postmortems; surface evidence and uncertainty without taking autonomous production action.
4. **RAG-04 Research Synthesis Workspace** — Collect papers and notes, deduplicate claims, cite passages, compare sources, flag conflicts, and export a traceable brief.
5. **RAG-05 Multimodal Document RAG** — Retrieve across text, tables, charts, and page images; preserve page coordinates and evaluate answer plus citation correctness.
6. **RAG-06 Customer Support Resolution Engine** — Retrieve product and account-safe context, draft grounded responses, abstain on low confidence, and learn from reviewed outcomes.
7. **RAG-07 Hybrid Search Reference Engine** — Implement dense retrieval, BM25, reciprocal-rank fusion, filters, reranking, and a labeled relevance benchmark.
8. **RAG-08 RAG Evaluation Laboratory** — Version datasets and prompts; measure retrieval recall, citation precision, groundedness, completeness, latency, cost, and regression significance.
9. **RAG-09 Adaptive Ingestion Framework** — Parse heterogeneous sources, choose semantic chunk boundaries, deduplicate, detect changes, preserve metadata, and support deletion.
10. **RAG-10 Knowledge-Graph Retrieval Study** — Extract entities/relations with provenance, combine graph and vector retrieval, and compare against a strong hybrid baseline.
11. **RAG-11 Private Personal Knowledge Vault** — Add local encryption, per-source permissions, export/deletion, transparent memory, and optional offline inference.
12. **RAG-12 Multilingual Retrieval System** — Compare multilingual embeddings, translation, language-specific BM25, reranking, and citation quality across languages.
13. **RAG-13 Freshness-Aware News and Policy Search** — Track publication/effective dates, superseded sources, incremental indexing, temporal queries, and stale-answer prevention.
14. **RAG-14 Air-Gapped RAG Appliance** — Package local ingestion, vector search, reranking, and model inference with resource budgets and no network dependency.
15. **RAG-15 Citation and Claim Verifier** — Decompose answers into claims, map each to retrieved evidence, flag unsupported or contradictory statements, and score verifier reliability.

## Track 15 — Agents, orchestration, and LLMOps

**Primary roles:** AI Engineer · Backend Engineer  
**Repository:** `agent-systems-lab`

1. **AGT-01 Structured-Output Reliability Agent** — Enforce typed schemas, validate tool results, repair or retry boundedly, log failures, and publish malformed-output recovery rates.
2. **AGT-02 Citation-Grounded Research Agent** — Retrieve, answer with passage-level citations, abstain below confidence thresholds, and score claim support on a fixed evaluation set.
3. **AGT-03 Bounded ReAct Planning Agent** — Observe, plan, act, and reflect with iteration/cost limits, loop detection, typed state, and graceful degradation.
4. **AGT-04 Multi-Tool Orchestrator** — Register capabilities, route by policy, run safe independent calls in parallel, resolve conflicts, and trace every decision.
5. **AGT-05 Memory-Enabled Assistant** — Separate working and long-term memory, compress context, score relevance, synchronize sessions, and let users inspect/delete memories.
6. **AGT-06 Human-in-the-Loop Approval Agent** — Pause on uncertainty or sensitive actions, request scoped approval, resume deterministically, expire approvals, and preserve an audit trail.
7. **AGT-07 Cost-Aware Model Router** — Budget tokens per task, route by quality/latency/cost, exit early on confidence, and compare savings without hiding quality loss.
8. **AGT-08 Event-Triggered Automation Agent** — Consume webhooks and queues, execute idempotent workflows, retry safely, dead-letter failures, and support replay.
9. **AGT-09 Multi-Agent Debate Evaluation** — Compare independent, debate, critic, and ensemble patterns on a labeled benchmark; report when extra agents hurt cost or quality.
10. **AGT-10 Self-Reflective Auto-Evaluation Agent** — Execute, score with a calibrated judge, critique, retry under constraints, and track real improvement versus evaluator bias.
11. **AGT-11 ★ Observable Production Agent Platform** — Add traces, latency/cost dashboards, loop and tool-failure alerts, eval gates, canaries, rollback, and per-workflow SLOs.
12. **AGT-12 MCP Service and Permission Sandbox** — Expose typed tools and resources, validate clients, scope permissions, enforce timeouts, and test malicious or malformed calls.
13. **AGT-13 Browser Quality-Assurance Agent** — Convert approved requirements into test plans and Playwright checks, require evidence for findings, and keep destructive actions gated.
14. **AGT-14 Governed Data Analyst Agent** — Translate questions into constrained queries, inspect schemas, prevent unsafe SQL, explain calculations, and verify answers against fixtures.
15. **AGT-15 Incident Response Copilot** — Correlate alerts, deploys, logs, traces, and runbooks; propose evidence-backed steps while leaving production actions to an authorized human.

## Track 16 — Large-scale system design and technical communication

**Primary roles:** All three roles  
**Repository:** `system-design-atlas`

Every project in this track is an interactive design dossier: requirements, capacity estimates, API, data model, architecture, failure analysis, security/privacy, cost, two deep dives, alternatives, and a small executable proof of the riskiest assumption.

1. **SD-01 URL Shortener at Global Scale** — Design redirect latency, key generation, hot-key handling, analytics, abuse controls, custom domains, and regional failover.
2. **SD-02 Distributed Rate-Limiting Service** — Design local/global enforcement, algorithm choice, configuration distribution, clock issues, graceful degradation, and tenant fairness.
3. **SD-03 End-to-End Messaging Platform** — Design delivery, ordering, presence, offline sync, media, encryption boundaries, multi-device state, and abuse response.
4. **SD-04 Team Collaboration Platform** — Design channels, threads, search, notifications, presence, file sharing, retention, enterprise permissions, and large workspaces.
5. **SD-05 Cloud File Synchronization** — Design chunking, deduplication, versioning, conflict resolution, metadata, sharing, virus scanning, and regional durability.
6. **SD-06 Global Video Platform** — Design upload/transcoding, storage tiers, CDN delivery, metadata, recommendations, moderation, and creator analytics.
7. **SD-07 Real-Time Mobility Dispatch** — Design geospatial indexing, matching, ETA, surge-like load without exploitative pricing, trip state, safety, and city failover.
8. **SD-08 Git Hosting and Code Review** — Design object storage, repository access, diffs, pull requests, hooks, search, CI events, permissions, and disaster recovery.
9. **SD-09 Web and Catalog Search Engine** — Design crawling/ingestion, indexing, ranking, freshness, spelling, personalization controls, evaluation, and serving.
10. **SD-10 Recommendation Platform** — Design event collection, feature pipelines, candidate generation, ranking, exploration, experimentation, feedback loops, and safety.
11. **SD-11 Vector Search Service** — Design sharding, HNSW/IVF indexes, metadata filters, replication, updates, recall/latency objectives, and multi-tenancy.
12. **SD-12 AI Agent Platform** — Design tool registry, identity, policy, state, queues, approvals, sandboxing, evaluation, observability, quotas, and failure recovery.
13. **SD-13 Payment Processing and Ledger System** — Design authorization/capture/refund, double-entry records, idempotency, reconciliation, webhooks, disputes, and auditability.
14. **SD-14 Social Feed and Timeline** — Design fan-out, ranking, privacy, deletes, celebrity hotspots, caching, freshness, moderation, and experiment hooks.
15. **SD-15 ★ Multi-Region AI Knowledge Platform** — Defend the complete AtlasOps architecture across ingestion, retrieval, model serving, agents, tenancy, safety, SLOs, cost, and disaster recovery.

---

## Build order for the 16 keystones

The keystones deliberately follow the roadmap's dependency graph.

| Wave                            | Keystone projects      | Outcome                                                                       |
| ------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| 1 — Engineering base            | DEV-01, SYS-01, API-01 | language, testing, API, concurrency, and release credibility                  |
| 2 — Correct production services | DB-01, TST-01, SEC-01  | persistence, verification, security, and documented tradeoffs                 |
| 3 — Product and distribution    | DST-01, FE-01, FS-01   | distributed backend plus a polished, accessible user experience               |
| 4 — Operate and learn from data | OPS-01, DE-01, ML-01   | cloud operations, data pipelines, ranking, experimentation, and monitoring    |
| 5 — Engineer AI systems         | DL-01, RAG-01, AGT-11  | model fundamentals, grounded retrieval, orchestration, evaluation, and LLMOps |
| 6 — Defend the architecture     | SD-15                  | a complete large-scale system-design narrative tying the portfolio together   |

The other 224 projects can be built as focused exhibits alongside the relevant keystone. A focused exhibit is complete when its claim is proven; it does not need the surface area of a startup.

## Three role-specific portfolio lenses

The same work should be filtered and narrated differently for each application.

| Role page               | Lead with                                                  | Supporting tracks                         | What the first screen must prove                                                              |
| ----------------------- | ---------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| **AI Engineer**         | AtlasOps, SignalLake, model-serving gateway                | DE, ML, DL, RAG, AGT, OPS, DB             | You evaluate, serve, monitor, secure, and control AI systems—not just call an API.            |
| **Backend Engineer**    | CommerceFlow, polyglot service platform, Reliability Forge | SYS, DEV, API, DB, DST, SEC, TST, OPS, DE | You reason about concurrency, data correctness, failure, scale, and operations.               |
| **Full Stack Engineer** | MoveTogether, SecureShare, accessible design system        | FE, FS, API, SEC, TST, OPS                | You can own product UX and the backend, with accessibility, performance, security, and tests. |

## Repository topology

Use repositories as coherent bodies of work, not as a counter.

- **6 product repositories:** AtlasOps, CommerceFlow, MoveTogether, SecureShare, SignalLake, Reliability Forge.
- **10 track repositories:** systems, developer tooling, data systems, security, quality, frontend, production ML, model engineering, agent systems, and system-design atlas.
- **4–10 optional product repositories:** only for FS projects that grow into serious standalone products.
- **Total target:** roughly 20–26 maintained repositories, producing 240 portfolio cards through subprojects, packages, releases, reports, and case studies.

Each monorepo needs a root map that links every project ID to code, evidence, status, and a case-study URL. Archive experiments that do not reach the definition of done; do not display unfinished cards as completed work.

## Selection and promotion score

Score a project before promoting it to the public site. A focused exhibit should score at least 70/100; a keystone should score at least 85/100.

| Dimension           | Points | Question                                                                         |
| ------------------- | -----: | -------------------------------------------------------------------------------- |
| Role relevance      |     25 | Does this prove a skill that appears in the target role?                         |
| Engineering depth   |     20 | Is there a non-trivial design, algorithm, data, concurrency, or systems problem? |
| Production evidence |     20 | Are reliability, security, tests, observability, cost, and failure addressed?    |
| Demo clarity        |     15 | Can a reviewer understand the problem and see it work in two minutes?            |
| Differentiation     |     10 | Is the approach or evidence meaningfully yours rather than a clone?              |
| Portfolio reuse     |     10 | Does it strengthen a flagship, shared library, benchmark, or design narrative?   |

Do not award points for the number of frameworks used. Tool count is not engineering depth.

## Definition of done

Every public project must satisfy the universal contract; then it must satisfy the relevant role contract.

### Universal contract

- A one-sentence problem statement, named user, real constraints, explicit non-goals, and an original requirements document.
- A runnable demo or deterministic local setup, seeded demo data, and a short video or animated walkthrough.
- Architecture diagram, data model, API or event contracts, at least two ADRs, and a tradeoff section.
- Automated tests selected for the risks; CI with formatting, static analysis, tests, dependency checks, and secret scanning.
- A threat model, privacy/data-retention note, accessibility note for any UI, and a license.
- Observability for important paths plus a benchmark, evaluation, or failure experiment that supports the central claim.
- A limitations section and honest next steps. Never label mocked scale, synthetic users, or estimated savings as production results.
- A case study that explains the hardest problem, one failed approach, measured improvement, and what you would change at ten times the load.

### Backend contract

- Versioned API/event schema, validation, consistent errors, authn/authz, idempotency where retries occur, migrations, and transactional boundaries.
- Timeouts, bounded retries with jitter, backpressure, graceful shutdown, health/readiness, structured logs, metrics, traces, and an SLO.
- PostgreSQL query plans and index reasoning, cache invalidation behavior, load results, and at least one injected dependency failure.

### Full-stack contract

- Responsive and semantic UI, complete keyboard paths, visible focus, error/loading/empty/offline states, and automated plus manual accessibility evidence.
- Justified rendering and state strategy, Core Web Vitals measurements, bundle analysis, component tests, Playwright journeys, and visual regression where useful.
- No fake buttons: every visible primary action either works or is explicitly labeled as a prototype limitation.

### AI contract

- Versioned dataset and evaluation set, meaningful baseline, quality metrics, failure taxonomy, and reproducible experiment configuration.
- Prompt/model/retrieval versions, latency and cost per task, safety and prompt-injection tests, confidence/abstention behavior, and human escalation.
- Model or system card covering intended use, exclusions, data, evaluation, limitations, privacy, and monitoring/drift response.

## Portfolio website information architecture

1. **Home:** one positioning sentence, three role doors, five flagship results, and a direct résumé/contact path.
2. **Role pages:** AI, Backend, and Full Stack lenses with reordered evidence and role-specific résumé bullets.
3. **Flagship case studies:** problem → constraints → architecture → hard decisions → demo → measured evidence → failures → lessons.
4. **Project atlas:** all 240 cards with filters for role, language, competency, project type, depth, and status.
5. **Skill matrix:** every roadmap competency maps to one keystone and at least two focused exhibits; no unsupported skill badges.
6. **Engineering evidence:** benchmark reports, evals, SLOs, runbooks, postmortems, threat models, design docs, and accessibility reports.
7. **Writing and open source:** technical articles, accepted contributions, issue discussions, and design reviews.

Each card should expose `project ID`, `one-line claim`, `role tags`, `problem`, `your decisions`, `stack`, `proof`, `live demo`, `source`, `case study`, and `status`. Default the atlas to keystones so the giant catalog never overwhelms the first-time visitor.

## Platform publishing rules

- **GitHub:** keep the profile README concise, pin the best role-relevant work, use strong repository descriptions/topics, and make each pinned README understandable within minutes.
- **Handshake:** feature the three role flagships and the main portfolio URL; use outcome-focused summaries, not a dump of 240 links.
- **Résumé:** include two to four strongest projects for the specific job, with truthful measured results and links to the matching role page.
- **Other platforms:** publish a short demo and one engineering insight, then route the reader to the full case study. Do not paste the same generic description everywhere.

## How the research inputs were used

- The roadmap supplied the competency coverage, production requirements, and dependency order. Its original 17 projects were retained as capabilities, then expanded into distinct proof artifacts rather than copied verbatim.
- The shared agent checklist became Track 15, with reliability, evaluation, permissions, auditability, and human control added as completion criteria.
- The Starter Story material supplied commercially legible categories: voice-to-structured-text, secure document sharing, forms, event control, job discovery, creator commerce, inventory sync, photo restoration, personal knowledge, and local discovery. The selections are original adaptations, not branded clones or claims that the cited revenue is reproducible.
- The project-based-learning repository supplied from-scratch patterns for servers, databases, storage, networking, interpreters, and distributed systems. Tutorial completion alone does not count; each selected exhibit requires original extensions, tests, measurements, and an explanation.

## Deliberate exclusions

The following ideas were intentionally not selected:

- Basic todo, weather, calculator, blog, or UI clone projects with no harder engineering claim.
- Thin LLM wrappers with no evaluation, grounding, permissions, cost controls, or failure handling.
- Products centered on gambling, speculative trading, alcohol, adult content, astrology/clairvoyance, deceptive interview assistance, or platform-abusing automation.
- “Build this company in a weekend” copies and any use of another business's revenue as evidence of your own demand.
- Premature microservices, Kafka, Kubernetes, or multi-agent architectures used only to inflate the stack.
- Two hundred forty separate low-maintenance repositories. The catalog measures proven competencies, not repository volume.

## Source references

- Local roadmap: `C:\Users\jahatehs\Downloads\roadmap-v2.md`
- Pasted Starter Story research: `C:\Users\jahatehs\.codex\attachments\43ef69f3-1031-4222-90b8-8e2c2c469af9\pasted-text.txt`
- Shared agent-project document: `https://docs.google.com/document/d/1qRw4TgihLpegEz1hgIznfFbSHxD0rq9k/`
- Project Based Learning: `https://github.com/practical-tutorials/project-based-learning`
- GitHub job-search portfolio guidance: `https://docs.github.com/en/account-and-profile/tutorials/using-your-github-profile-to-enhance-your-resume`

## Final recommendation

Commit to the **16 keystones first**, publish the site as soon as the first three are credible, and add focused exhibits continuously. The catalog is the long-term proof map; it is not a prerequisite for applying. The strongest possible portfolio is not the one with the highest count—it is the one where every claimed competency has inspectable evidence and the first five projects are impossible to dismiss as tutorials.
