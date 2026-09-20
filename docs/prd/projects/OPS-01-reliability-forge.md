# OPS-01 — GitOps Kubernetes Production Environment

**Project ID:** `OPS-01`
**Track:** Track 8 — Cloud, DevOps, platform engineering, and SRE
**Repository:** `reliability-forge`
**Tier:** keystone · **Status:** `planned` · **Proof level:** `code` · **Visibility:** `unlisted`
**Manifest:** `content/projects/OPS-01.json` (authoritative under PRD 5.1.1)
**Canonical URL:** `/projects/gitops-kubernetes-production-environment`

---

## 0. How to read this document

Nothing in this project has been built. The manifest records `status: planned`, `proofLevel: code`,
an empty `stack`, an empty `evidence` array, an empty `metrics` array, a null `content.problem`, and
null `dates`. Every number in this document is therefore a **target with a stated measurement
method**, never a result. There are no achieved availability figures, no MTTR, no incident counts,
no budget-consumed percentages and no dates, because none exist and inventing them would destroy
the only thing an SRE exhibit is worth: the claim that its numbers came from somewhere.

PRD 0.10 ("Truth outranks spectacle") and PRD 12.2 ("No workstream may invent project metrics ...
performance results, or external validation") are binding here. An SRE portfolio piece that quotes
a fabricated 99.95% is worse than one that quotes nothing, because the fabrication is the only part
a reviewer can check and it is the part that fails.

Where this document specifies something the manifest does not yet contain, it says so explicitly
and section 12 collects every such case. This document proposes; the manifest decides.

---

## 1. The problem, and who has it

The manifest's `content.problem` is `null`. This section specifies it; it is a proposal for that
field, not a record of it.

**The problem.** A team running services on Kubernetes accumulates a gap between what the
repository says the cluster contains and what the cluster actually contains. The gap opens through
ordinary, well-intentioned acts: a scale-up during an incident, a `kubectl edit` to unblock a
deploy, a Helm release applied from a laptop, an operator that mutates its own CRs, a controller
upgrade that silently rewrites defaults. Nobody records the divergence because at the moment it
happens it is a fix, not a change. The cost arrives later — the next clean apply reverts the fix,
the disaster-recovery rebuild produces a cluster that behaves differently from the one it replaced,
and the question "what was running when this broke?" has no answer.

The second half of the problem is that deployment safety is usually asserted rather than
demonstrated. Teams say they can roll back. Few can say how long a rollback takes, which failures
it covers, which it does not, and what a reviewer would see while it happened. The gap between "we
have rollback" and "here is a recording of the rollback, with timings, run ten times" is the entire
distance between a claim and an exhibit.

**Who has it.**

- A small platform or infrastructure team, two to eight engineers, operating between five and fifty
  services on one or two Kubernetes clusters. Large enough that hand-application does not scale,
  small enough that there is no dedicated release-engineering function.
- The on-call engineer at 03:00 who needs to know whether the fastest safe action is a revert, a
  scale, or a feature-flag flip — and needs that answer to be the same one the system will enforce
  when the automation next reconciles.
- The engineer inheriting a cluster nobody documented, who needs the repository to be a true
  description of the runtime rather than an aspirational one.
- For the portfolio's own purposes: a hiring engineer who wants to see whether the author can build
  a delivery system whose safety properties are mechanical rather than cultural.

**Why the obvious alternatives are insufficient.** Push-based CI deployment (`kubectl apply` from a
pipeline) is simpler and is the right answer for many teams, but it has no opinion about the cluster
between deploys: it cannot detect drift, it cannot correct it, and it requires the CI system to hold
cluster-admin credentials that reach inward through the network boundary. A pull-based reconciler
inverts that: the cluster holds credentials to read a repository, CI never touches the cluster, and
the desired state is continuously compared to the live state rather than compared once per deploy.
That inversion is the thing this exhibit demonstrates, and the rollback drill is how it is proved.

---

## 2. What this exhibit is

OPS-01 is the keystone of Track 8. It is the environment the other fourteen exhibits deploy into,
and it is itself an exhibit: a reviewer should be able to read the repository, understand the
control loop, run the drills, and see the recorded evidence of those drills.

It has three deliverables, in dependency order:

1. **A reproducible environment.** Terraform that provisions the cluster and its supporting cloud
   resources, plus a local equivalent that requires no cloud account, so the control loop can be
   exercised for free.
2. **A control loop with enforced invariants.** Argo CD reconciling a Git repository into the
   cluster; admission policy that rejects workloads without probes, resource requests, memory
   limits, provenance or network isolation; CI that runs the same policies against rendered
   manifests before merge.
3. **A rollback demonstration.** A deliberately broken release, a recorded recovery, and a timing
   record produced by a repeatable harness rather than by narration.

The demonstration is the point. The first two deliverables exist so that the third one means
something.

---

## 3. Non-goals

Stated as refusals, because each one is a thing a reviewer might reasonably expect and will
otherwise assume was forgotten.

- **Not a production service with users.** There are no real users, no real traffic, no revenue and
  no external dependency on uptime. The workload under management is a synthetic service
  (`checkout-sim`) whose only job is to have controllable failure modes.
- **Not a Kubernetes distribution, operator or controller.** This exhibit composes upstream
  components. If a component needs replacing, that is a separate exhibit.
- **Not multi-region, and not stateful failover.** Regional loss is OPS-11. Data restore and
  RPO/RTO are OPS-08. Progressive traffic shifting is OPS-07. This exhibit deliberately confines
  itself to single-cluster, stateless rollback, and section 10.5 explains why the stateful case is
  excluded rather than merely absent.
- **Not a service mesh.** Mesh reliability primitives are OPS-13. Ingress here is a single
  gateway.
- **Not a cost-optimisation study.** Cost attribution is OPS-09. Section 4 states this exhibit's
  own cost posture, which is an operating constraint, not a research output.
- **Not a security programme.** Image signing and admission verification are in scope because a
  provenance policy is part of the enforcement story. Full supply-chain work — SBOMs, scanning,
  minimal base images — is OPS-12.
- **Not a claim about long-run availability.** See section 9.4. The environment does not run long
  enough to support one, and the document says so rather than implying otherwise.

### 3.1 The cost non-goal, stated honestly

A permanently running cloud Kubernetes environment costs real money every hour, whether or not
anybody is looking at it. A managed control plane alone is a fixed monthly charge before a single
node exists; add two nodes, a load balancer, a NAT gateway and a registry and the exhibit becomes a
standing subscription with no revenue against it. An exhibit that quietly bankrupts its author gets
torn down, and a torn-down exhibit is a dead link in a portfolio.

The honest resolution is to be explicit about what runs continuously and what does not:

| Tier      | What it is                                                                             | Lifetime                                                   | Cost posture                             |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------- |
| `local`   | `kind`/`k3d` cluster, full Argo CD, full policy set, `checkout-sim`, Prometheus        | Created and destroyed per CI job and per working session   | Zero. Runs on a laptop and on CI runners |
| `lab`     | Real managed Kubernetes: cloud IAM, load balancer, DNS, managed node group, registry   | Created by a scheduled workflow, destroyed by the same run | Metered; only exists inside a window     |
| `records` | Drill outputs, Prometheus snapshots, Argo exports, rendered manifests, terraform plans | Permanent, in Git and in the portfolio's evidence store    | Effectively zero — static files          |

**Nothing runs permanently.** The permanent artefact is the evidence, not the cluster. The `lab`
tier exists to hold the things that cannot be honestly faked locally — real cloud IAM and workload
identity, a real load balancer with a real certificate, real node-group scaling, real multi-AZ pod
placement — and it is brought up by `lab-up.yml`, drilled, exported, and destroyed by `lab-down.yml`
in the same workflow run, with a hard `always()` teardown step and a scheduled orphan sweeper that
destroys any `lab` resource older than the maximum window length regardless of why it survived.

This is how the exhibit stays affordable without becoming a toy: the _control loop_ is real and runs
continuously in `local`, where it costs nothing and where every policy, every sync, every drill and
every CI check executes on every pull request. The _cloud substrate_ is real but episodic. The
tradeoff is stated in section 9.4 and again in section 12: a window-scoped environment cannot
support a long-run availability claim, and the exhibit must therefore make a different claim —
about mechanism, latency and reproducibility — rather than stretch a six-hour window into a
sentence about nines.

---

## 4. The environment under management

One cluster per environment, three environments, one repository.

**Cloud resources (Terraform-owned).** VPC with private node subnets and public load-balancer
subnets; a managed Kubernetes control plane; one managed node group with a small fixed size plus one
autoscaling group reserved for OPS-06; an OIDC provider and workload-identity role bindings so
in-cluster workloads receive cloud credentials without static secrets; a container registry; a
hosted zone and certificate; an object bucket for drill records and Prometheus snapshots; a remote
state backend with locking, bootstrapped separately and never destroyed by an environment apply.

**Cluster resources (Argo-owned).** Everything else. Namespaces, Argo CD itself after bootstrap,
the policy engine, Prometheus and Alertmanager, the ingress controller, the drill harness's
service accounts, and every exhibit's workloads.

**The boundary between them is a rule, not a habit.** Terraform owns things whose identity is a
cloud API object. Argo owns things whose identity is a Kubernetes API object. Nothing is owned
twice. The one legitimate crossing is the bootstrap: Terraform installs Argo CD once and registers
the root Application; from that moment Argo owns its own upgrades, and Terraform's Argo resource is
marked `ignore_changes` on everything except existence. The tradeoff is that Argo's own manifest
lives in two places conceptually (the bootstrap and `platform/40-argocd/`), and a CI check asserts
the bootstrap version string never diverges from the `platform/` chart version.

**The workload under management.** `checkout-sim` is a small Go service with deliberately
controllable failure modes, selected by environment variable and compiled into every image so that
a "broken" build is a configuration of a known-good binary rather than a separately maintained
broken one. This matters for reproducibility: the faults in section 10 must be bit-identical
between runs. Its modes: healthy; readiness-never-ready; slow-start; partial-5xx at a set rate;
memory-growth; and CPU-hot. Each mode maps to a drill.

---

## 5. Repository layout

### 5.1 Why a declarative repository needs a different layout

`reliability-forge` hosts OPS-01 plus the fourteen focused exhibits OPS-02 through OPS-15. In an
application repository, boundaries are enforced by the language: a module that does not import
another module cannot call it, and the compiler says so. A declarative repository has no compiler
and no import graph. Two YAML files in unrelated directories can collide in the cluster because
they name the same namespace, the same ClusterRole, the same CRD, the same ingress host or the same
`ClusterPolicy`. The filesystem tells you nothing about that; only the apply does.

So the layout has to do work the compiler would otherwise do. Three properties are required:

1. **Independent deployability.** A reviewer must be able to deploy OPS-07 without deploying
   OPS-13, and a failure in one exhibit must not prevent the others from reconciling.
2. **Mechanically checkable boundaries.** "Don't reference another exhibit's files" must be a CI
   failure, not a convention in a README.
3. **A single, obvious location per artefact kind**, because the failure mode of declarative repos
   is not bad code, it is the same concept expressed in four places that drift apart.

### 5.2 The tree

```text
reliability-forge/
├── README.md
├── Taskfile.yml                     # every command CI runs is runnable locally by the same name
├── CODEOWNERS
├── .github/
│   └── workflows/
│       ├── validate.yml             # fmt, validate, boundary check, render, policy — every PR
│       ├── terraform-plan.yml       # plan per environment, plan JSON → conftest
│       ├── terraform-apply.yml      # manual/scheduled, OIDC to cloud, no static keys
│       ├── policy-test.yml          # kyverno test + conftest unit tests
│       ├── argo-diff.yml            # rendered desired state vs live, per exhibit
│       ├── lab-up.yml               # provision the metered tier
│       ├── lab-down.yml             # destroy it; always() teardown + orphan sweeper
│       └── drill.yml                # run a named drill, publish its record
├── docs/
│   ├── adr/                         # decisions; one file per decision, numbered
│   ├── runbooks/                    # what a human does, per alert
│   └── slo/                         # SLI definitions as code-adjacent prose
├── infra/
│   ├── modules/                     # reusable, environment-agnostic
│   │   ├── network/
│   │   ├── cluster/
│   │   ├── node-group/
│   │   ├── workload-identity/
│   │   ├── registry/
│   │   ├── dns-and-certs/
│   │   ├── state-backend/
│   │   └── evidence-bucket/
│   └── environments/                # thin roots; composition only
│       ├── bootstrap/               # state backend + CI OIDC role; applied once, by hand
│       ├── local/                   # no cloud provider; kind config + argo bootstrap only
│       └── lab/
│           ├── main.tf              # module calls, nothing else
│           ├── backend.tf
│           ├── providers.tf
│           ├── variables.tf
│           └── lab.tfvars
├── clusters/                        # Argo's entry points, one directory per environment
│   ├── local/
│   │   ├── root-app.yaml            # the app-of-apps root
│   │   ├── projects/                # AppProject per exhibit + one for platform
│   │   └── applicationsets/
│   │       ├── platform.yaml
│   │       └── exhibits.yaml        # directory generator over exhibits/*/k8s/overlays/local
│   └── lab/
│       └── …                        # same shape, different destinations and policy mode
├── platform/                        # cluster-wide services, ordered by sync wave
│   ├── 00-namespaces/
│   ├── 10-policy-engine/
│   ├── 20-observability/            # Prometheus, Alertmanager, recording rules, burn alerts
│   ├── 30-ingress/
│   └── 40-argocd/
├── policy/
│   ├── kubernetes/                  # the single source of truth for admission rules
│   │   ├── probes/
│   │   ├── resources/
│   │   ├── images/
│   │   ├── network/
│   │   └── ownership/
│   ├── terraform/                   # rego, evaluated against plan JSON
│   │   ├── tagging.rego
│   │   ├── iam.rego
│   │   ├── network.rego
│   │   └── blast-radius.rego
│   └── tests/
│       ├── kubernetes/              # per-policy pass/fail fixtures
│       └── terraform/               # fixture plan JSON, expected denials
├── exhibits/
│   ├── OPS-01-gitops-baseline/
│   │   ├── exhibit.yaml             # the exhibit manifest: shape, environments, owner, waivers
│   │   ├── k8s/
│   │   │   ├── base/
│   │   │   └── overlays/
│   │   │       ├── local/
│   │   │       └── lab/
│   │   ├── drills/                  # drill definitions owned by this exhibit
│   │   └── evidence/                # what this exhibit publishes to the portfolio
│   ├── OPS-02-landing-zone/
│   │   ├── exhibit.yaml
│   │   ├── terraform/               # no k8s/ at all; the ApplicationSet skips it
│   │   └── evidence/
│   ├── OPS-03-observability/
│   ├── …
│   └── OPS-15-edge-cache/
├── workloads/
│   └── checkout-sim/                # source, Dockerfile, failure modes, release digests
├── drills/
│   ├── harness/                     # the runner: fault injection, timing, export, record write
│   ├── schema/                      # JSON Schema for a drill definition and a drill record
│   └── records/                     # committed outputs; append-only in practice
└── tools/
    ├── boundary/                    # the boundary checker described in 5.5
    ├── render/                      # kustomize build for every overlay, deterministic output
    └── evidence/                    # packages drill records into portfolio evidence payloads
```

### 5.3 Terraform: why modules and environments are separate directories

They are separated because they are different kinds of object with incompatible properties, and
merging them costs both.

A **module** is a function. It declares inputs and outputs, contains no `backend` block, no
`provider` block, no hardcoded account ID, region, cluster name or CIDR, and no `terraform.tfvars`.
It can therefore be instantiated twice in one root, tested in isolation with `terraform test`
against synthetic inputs, and validated in CI with no cloud credentials at all.

An **environment root** is a call site. It owns the backend (and therefore the state file), the
provider configuration (and therefore the credentials and region), the variable values, and the
composition. It contains module calls and almost nothing else.

Three reasons this separation is not cosmetic:

1. **State is the blast radius.** A `terraform apply` can only damage what is in its state file.
   Keeping each environment as its own root with its own state means a mistake in `lab` cannot
   touch `bootstrap`, and the state-backend resources that everything depends on are in a root that
   is applied by hand, rarely, with a human reading the plan. If modules carried their own backends
   they could not be composed; if environments were one giant root, a single bad plan would put the
   state backend at risk.
2. **Modules become untestable the moment they know where they run.** A module with a `provider`
   block cannot be given a different region by its caller and cannot be exercised by CI without
   credentials. Keeping providers at the root means `terraform validate` and the module tests run
   on every pull request, free, in seconds.
3. **Review reads differently.** A diff in `infra/modules/` is a change to a capability and affects
   every caller; a diff in `infra/environments/lab/` is a change to one environment. Making that
   distinction visible in the path is the cheapest possible review signal, and CODEOWNERS can treat
   the two differently.

The cost: finding where a resource is actually defined is a two-hop lookup, and a change that
touches both a module and its call site produces a diff that reviewers must read in two places.
That is accepted; see 5.6.

### 5.4 Argo CD: app-of-apps, and why exhibits are isolated by construction

The reconciliation graph is three levels deep.

1. **Root Application** (`clusters/{env}/root-app.yaml`). Bootstrapped once by Terraform. Its only
   job is to point at `clusters/{env}/`, so every subsequent addition is a commit rather than a
   cluster operation.
2. **ApplicationSets.** `platform.yaml` uses a directory generator over `platform/*`, with sync
   waves encoded in the directory prefix so the policy engine is admitted before anything it must
   govern. `exhibits.yaml` uses a directory generator over `exhibits/*/k8s/overlays/{env}` — an
   exhibit with no overlay for that environment (OPS-02, which is pure Terraform) simply produces
   no Application, with no special-casing.
3. **One Application per exhibit per environment**, each with its own destination namespace, its own
   `AppProject`, and its own sync policy.

Isolation is a property of the `AppProject`, not of the directory layout, because directories are
advisory and projects are enforced by the Argo API server:

- `sourceRepos` and source path restrictions bind the project to `exhibits/OPS-NN/**` plus an
  explicitly allowlisted set of shared bases. An Application in project `ops-07` cannot sync
  manifests from `exhibits/OPS-13/`, whatever a `kustomization.yaml` claims.
- `destinations` binds the project to namespace `ops-07` (and, where unavoidable, named
  cluster-scoped resources). An exhibit cannot create objects in another exhibit's namespace even
  if its manifests ask to.
- `clusterResourceWhitelist` is empty for exhibit projects by default. Cluster-scoped objects —
  CRDs, ClusterRoles, webhooks, PriorityClasses — belong to `platform/` and require an explicit,
  reviewed addition to the project. This is the single largest source of cross-exhibit breakage in
  a shared cluster and it is closed by default.
- Each Application has its own health and sync status. A degraded OPS-13 leaves OPS-07 `Synced` and
  `Healthy`; there is no aggregate that fails together. The root Application's health is
  deliberately not treated as the environment's health signal.

Sync policy differs by environment on purpose: `local` runs `automated: {prune: true, selfHeal:
true}` so drift correction can be demonstrated freely; `lab` runs the same, because a GitOps exhibit
that disables self-heal in its realistic environment is not demonstrating GitOps. Manual sync
windows exist only for `platform/40-argocd/`, because an Application that manages its own
controller can deadlock mid-upgrade.

### 5.5 Module contracts

For every top-level directory: what it owns, what it may depend on, what it must never reference.
"Reference" means any of: a Kustomize `resources:` path, a Terraform `module` source, a Helm
`dependencies` entry, a file path in a script, or an assumption that a named object exists.

| Module                   | (a) Owns                                                                   | (b) May depend on                                                        | (c) Must never reference                                                                                           |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `infra/modules/*`        | One cloud capability each: its resources, its variables, its outputs       | Other `infra/modules/*` by relative path, where composition is genuine   | Any `infra/environments/*`; any `exhibits/*`; any backend, provider, account, region or environment name literal   |
| `infra/environments/*`   | Backend, providers, tfvars, module composition for exactly one environment | `infra/modules/*`; outputs of `bootstrap` via remote state data source   | Another environment's state or directory; `exhibits/*`; raw `resource` blocks outside a documented allowlist       |
| `clusters/{env}`         | Root Application, AppProjects, ApplicationSets for one environment         | Paths under `platform/` and `exhibits/*/k8s/overlays/{env}` as data      | Another environment's `clusters/` directory; exhibit internals beyond the overlay entry point                      |
| `platform/*`             | Cluster-wide services and all cluster-scoped objects                       | `policy/kubernetes/` as the policy source                                | Any `exhibits/*` path; any exhibit namespace name; any drill                                                       |
| `policy/kubernetes/*`    | Admission rules; their audit/enforce mode; their expiry annotations        | Nothing. Policies are leaves                                             | Exhibit paths, exhibit names, workload names, environment names (mode is set by overlay, not by the rule)          |
| `policy/terraform/*`     | Rego over Terraform plan JSON                                              | Nothing                                                                  | Kubernetes manifests; the Terraform source tree (it sees plan JSON only)                                           |
| `exhibits/OPS-NN/*`      | Its `exhibit.yaml`, its manifests, its overlays, its drills, its evidence  | `platform/` shared bases on the allowlist; `workloads/` images by digest | **Any other `exhibits/OPS-MM/` path**; any `infra/environments/*`; any `policy/` file; another exhibit's namespace |
| `workloads/checkout-sim` | Service source, Dockerfile, failure modes, published digests               | Nothing in this repository                                               | Any exhibit, any cluster, any policy; it must be buildable and runnable standalone                                 |
| `drills/harness`         | Fault injection, timing, export, record writing, record schema conformance | `exhibits/*/drills/*.yaml` as data; cluster APIs at runtime              | Exhibit manifests directly; hardcoded exhibit names; anything under `infra/`                                       |
| `tools/*`                | Repository checks and packaging                                            | Everything, read-only                                                    | Writing to any path outside `drills/records/` and its own output directory                                         |

The single most load-bearing row is `exhibits/OPS-NN`: an exhibit may never reference another
exhibit. If OPS-07 needs something OPS-13 has, the answer is to promote it into `platform/` with a
reviewed ADR, not to reach sideways. Sideways references are how a declarative monorepo acquires an
implicit dependency graph nobody can see.

### 5.6 How boundaries and drift are caught mechanically

Conventions decay. Every rule in 5.5 has a check that fails a pull request.

**1. `tools/boundary` — static reference analysis (runs on every PR).** Parses every
`kustomization.yaml`, every Terraform `module` block, every `exhibit.yaml` and every script path
reference, builds the actual reference graph, and asserts it against the table in 5.5. It fails on:
a path from `exhibits/A` into `exhibits/B`; a `resources:` entry that escapes the exhibit root into
anything not on the shared-base allowlist; a `backend` or `provider` block inside `infra/modules/`;
a `resource` block in an environment root outside the allowlist; an environment root reading another
environment's state; an image reference that is a tag rather than a digest. The check is the graph,
not a grep, so a relative path that walks up and back down (`../../OPS-13/k8s/base`) is caught by
normalisation rather than by pattern.

**2. `terraform validate` + `terraform plan` → conftest (every PR).** Every environment is planned
with `-lock=false -refresh=false` against the current state, the plan is converted to JSON, and
`policy/terraform/` is evaluated over it. The plan JSON is the right input because it describes
what will actually happen, including provider-computed values, rather than what the HCL appears to
say. Denials include: any resource without the `Exhibit`, `Environment` and `ManagedBy` tags; an
IAM policy with `Action: "*"` or `Resource: "*"`; a security group open to `0.0.0.0/0` on anything
but the load balancer; a publicly readable bucket; and a **blast-radius rule** that fails any plan
destroying or replacing more than a configured number of resources, or destroying anything tagged
`Protected`, unless the pull request carries a specific label. The plan output is posted to the pull
request so the diff is reviewed as a diff, not as an intention.

**3. Render, then run the real admission policies (every PR).** `tools/render` runs `kustomize
build` over every overlay in every environment and writes the result to a deterministic output tree.
`policy-test.yml` then evaluates `policy/kubernetes/` over that rendered output using the policy
engine's own CLI. This is the important structural choice: **the CI check and the admission
controller read the same policy files.** There is no CI-only copy of the rules to drift, and a
manifest that would be rejected at admission cannot pass CI. A rendered-output diff is also
committed as an artefact, so a change to a shared base shows its downstream effect on all fourteen
exhibits in the pull request itself.

**4. Policy unit tests (every PR).** `policy/tests/` holds pass and fail fixtures per rule. A
policy without at least one passing and one failing fixture fails CI. Policies are code; untested
policy is the most dangerous kind, because it fails open and silently.

**5. Argo diff against live (on PR, when the target environment exists).** `argo-diff.yml` renders
the desired state for the pull request's head and compares it to the live cluster per Application.
Two failures: an unexpected diff **outside** the exhibits the pull request touches — which means a
shared base leaked — and a diff in an Application the pull request claims not to change. When `lab`
is not up, the job runs against `local` and records that it did, rather than skipping silently.

**6. Runtime backstop: AppProject restrictions.** Checks 1–5 run in CI and CI can be bypassed. The
`AppProject` restrictions in 5.4 are enforced by the Argo API server at sync time and cannot be
bypassed by merging. Defence in depth is deliberate here: the static check gives a fast, readable
failure; the project restriction guarantees the property.

**7. Drift detection.** Argo reconciles on a poll interval and on repository webhook. Self-heal
reverts unauthorised mutation automatically; the interesting artefact is the record of it. A
scheduled job exports every Application's sync status and diff, and fails if any Application has
been `OutOfSync` for longer than a threshold, or if `selfHeal` has fired more than a threshold
number of times in a window — because repeated self-heal means something outside Git is fighting
the reconciler, which is a different and worse problem than a one-off `kubectl edit`. Every
self-heal event is written to `drills/records/drift/` with the object, the field, the actor from the
audit log, and the time to correction.

**8. Determinism.** `tools/render` output must be byte-identical across runs; CI regenerates it and
fails on a non-empty `git diff`. This matches PRD 5.1.3's determinism requirement and is what makes
the rendered-output diff trustworthy as a review artefact.

### 5.7 The tradeoff being accepted

**This layout optimises for blast-radius containment and pays for it in duplication.**

Fifteen exhibits each carry their own `base/`, their own per-environment overlays, their own
namespace, their own AppProject and often manifests that are ninety percent identical to a
neighbour's. A DRY layout — one shared base, fifteen thin overlays — would be substantially smaller
and would read better on first inspection. It is rejected because a shared base makes every exhibit
a downstream consumer of every edit to it: one careless change to a shared `Deployment` base breaks
fourteen unrelated exhibits at once, and the repository's central claim is that an exhibit failing
is a contained event a reviewer can observe in isolation. Duplication is visible, greppable and
locally fixable; coupling is none of those.

Three further costs are accepted explicitly:

- **A single Argo instance is shared fate.** Every exhibit depends on one reconciler. Mitigation:
  Argo lives in `platform/`, is version-pinned, and its upgrade is itself a drill (DR-05) with a
  documented rollback. Running an Argo instance per exhibit would remove the shared fate and would
  cost more than the failure it prevents.
- **Two policy languages.** Admission policy is expressed in the policy engine's own CRDs;
  Terraform policy is Rego over plan JSON. Maintaining two dialects is a real cost. It is accepted
  because they operate on disjoint object domains and the alternative — one language over both —
  means either giving up using the admission engine's own CLI as the CI check (losing the
  single-source-of-truth property in check 3) or reimplementing admission in Rego and running a
  second webhook.
- **Module/environment indirection.** Two hops to find a resource definition, as noted in 5.3.

---

## 6. The GitOps control loop

### 6.1 What reconciles what

```text
                   pull request
                        │
        ┌───────────────▼────────────────┐
        │ CI: fmt · validate · boundary  │   no cluster credentials
        │ render · policy · plan · diff  │   nothing is applied here
        └───────────────┬────────────────┘
                        │ merge to main
                        ▼
                  Git (desired state)
                        │  read-only, pull-based
                        ▼
        ┌────────────────────────────────┐
        │ Argo CD in-cluster             │  compares desired ↔ live
        │ per Application, per namespace │  every interval + on webhook
        └───────────────┬────────────────┘
                        │ apply (server-side)
                        ▼
        ┌────────────────────────────────┐
        │ Admission: policy engine       │  the last gate; rejects here
        └───────────────┬────────────────┘
                        ▼
                  Kubernetes objects
                        │
                        ▼
        Prometheus → SLI recording rules → burn-rate alerts → release gate
```

The direction of every arrow is the design. CI never holds cluster credentials and never applies
anything; the only thing it can do is refuse to merge. Argo holds a read-only deploy key for the
repository and cluster-admin inside its own cluster. The network consequence is that the cluster's
API server needs no inbound path from CI at all.

### 6.2 Drift, and what happens when someone changes the cluster by hand

Drift is any difference between the rendered desired state and the live state that Git did not
cause. Argo detects it two ways: a poll on a fixed interval, and an immediate reconcile on
repository webhook. The poll is what catches out-of-band mutation, so the interval is the worst-case
detection latency and is a stated target in section 9.3, not an implementation detail.

When an engineer runs `kubectl scale deployment/checkout-sim --replicas=9`:

1. Within the reconcile interval, Argo marks the Application `OutOfSync` and reports the specific
   field difference.
2. `selfHeal: true` reapplies the desired state. The replica count returns to the value in Git.
   The engineer's change is gone, and it was gone whether or not anybody noticed.
3. The event is exported to `drills/records/drift/` with the object, the field, the actor resolved
   from the API audit log, and the measured detection-to-correction interval.
4. If the same object drifts repeatedly, the self-heal-rate alert fires. A loop means a controller
   or a person is fighting the reconciler, and that is a bug in the desired state, not a bug in the
   cluster.

This is the behaviour the exhibit wants a reviewer to internalise: **the correct way to scale is a
commit.** The emergency hatch is real and documented — `argocd app set --sync-policy none` disables
self-heal for one Application, is logged, and raises an alert if it remains set past a threshold
because a permanently unmanaged Application is drift with extra steps. Fields that a controller
legitimately owns (HPA-managed `replicas`, injected sidecars, defaulted fields) are excluded by
explicit `ignoreDifferences` entries, each with a comment naming the owning controller. An
unexplained `ignoreDifferences` entry is a boundary violation and check 1 in 5.6 rejects one whose
comment does not name an owner.

The unpleasant case the exhibit must not hide: **self-heal will revert an incident fix.** An
engineer who patches a live object at 03:00 to stop an outage will lose that patch at the next
reconcile. The runbook's answer is that the fix is a revert or a commit, never a patch, and DR-03
demonstrates exactly this reversion so the reviewer sees the sharp edge rather than reading a
reassurance about it.

---

## 7. Policy enforcement

Policies exist as files in `policy/kubernetes/`, are evaluated at admission by the in-cluster
engine, and are evaluated in CI by the same engine's CLI over rendered manifests (5.6, check 3).

### 7.1 The policy set

| Policy                 | Rule                                                                                                                          | Mode in `lab` | Why                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `require-probes`       | Every container in a Deployment/StatefulSet/DaemonSet declares `readinessProbe`; long-start containers declare `startupProbe` | Enforce       | Without readiness, a rolling update routes traffic to a process that is not serving. This is the single most common cause of self-inflicted deploy outages |
| `distinct-liveness`    | If `livenessProbe` exists it must not be byte-identical to `readinessProbe`, and its failure threshold must be the looser one | Enforce       | Identical probes turn a dependency slowdown into a cluster-wide restart storm — the failure mode is worse than having no liveness probe at all             |
| `require-requests`     | CPU and memory `requests` set on every container                                                                              | Enforce       | Requests are what the scheduler reasons about. Without them, placement is arbitrary and every capacity statement is fiction                                |
| `require-memory-limit` | Memory `limit` set on every container                                                                                         | Enforce       | Memory is incompressible. A container without a memory limit can evict its neighbours; containment must be enforced, not requested                         |
| `no-cpu-limit`         | CPU `limit` must be **absent** unless the workload is annotated as latency-isolated                                           | Audit         | A deliberate inversion: CPU limits cause CFS throttling and tail latency on bursty services. Audit, not enforce, because it is a judgement call            |
| `image-digest`         | Every image reference is a digest, never a tag                                                                                | Enforce       | A tag is mutable. Rollback by revert is only meaningful if the revert restores the same bytes                                                              |
| `image-provenance`     | Images from the exhibit registry must carry a valid signature for the expected identity                                       | Enforce       | The admission gate is what makes signing load-bearing rather than decorative                                                                               |
| `registry-allowlist`   | Images come from the exhibit registry or an allowlisted upstream mirror                                                       | Enforce       | Bounds what can run to what was reviewed                                                                                                                   |
| `default-deny-network` | Every exhibit namespace **is generated** a default-deny ingress and egress NetworkPolicy                                      | Generate      | See 7.2                                                                                                                                                    |
| `egress-allowlist`     | Any NetworkPolicy permitting egress beyond the namespace and DNS must carry a justification annotation                        | Enforce       | Makes the exception visible in the manifest and therefore in review                                                                                        |
| `pod-security`         | Namespace carries `restricted` Pod Security labels; no privileged, no host namespaces, no writable root filesystem            | Enforce       | Delegates the well-specified part to built-in admission; the policy only asserts the labels exist                                                          |
| `require-ownership`    | Every object carries `exhibit: OPS-NN` and `environment` labels                                                               | Enforce       | Ownership labels are what make per-exhibit isolation, drill scoping and cost attribution (OPS-09) possible at all                                          |

### 7.2 Enforcement mode, and why one policy generates instead of denying

Most policies **deny at admission**: the API request is rejected, Argo reports the Application
`Degraded` with the rejection message, and nothing reaches the cluster. This is correct for rules
about the _content_ of a submitted object, because the submitter is present and the failure is
attributable.

`default-deny-network` cannot work that way. The violation is an **absence** — a namespace with no
NetworkPolicy — and admission control sees submitted objects, not missing ones. There is no request
to deny. So the policy uses a generate rule: creating a namespace with an `exhibit` label
synthesises a default-deny ingress and egress NetworkPolicy owned by the policy engine. The
exhibit then adds explicit allow rules for the traffic it genuinely needs. The tradeoff is that
default-deny arrives by a mechanism outside the exhibit's own manifests, which is surprising the
first time and is called out in the runbook; the alternative — requiring every exhibit to remember a
NetworkPolicy — makes the secure state opt-in, and opt-in security is eventually not security.

### 7.3 Audit versus enforce, and the expiry rule

A new policy lands in **Audit** mode. Audit records violations without blocking, which is the only
way to learn whether a rule is correct against existing workloads before it starts rejecting them.
Landing a new rule directly in Enforce is how a policy engine acquires a reputation for breaking
deploys and then gets bypassed.

Audit is a transition state, not a resting place. Every Audit policy carries a dated expiry
annotation, and CI fails when an Audit policy is past expiry without either promotion to Enforce or
a written, dated exception in `docs/adr/`. This mirrors PRD 9.1's treatment of tool-defect
allowlists: an exception is allowed, an exception without an expiry is not.

Environments differ. `local` runs `image-provenance` and `registry-allowlist` in Audit, because
local bring-up legitimately pulls unsigned upstream images and a developer environment that cannot
start is a developer environment nobody uses. `lab` enforces both. The mode is set by the overlay;
the rule file is identical, so there is exactly one definition of each policy and the environments
differ only in severity.

---

## 8. Observability

Enough to measure the SLIs in section 9 and no more; the observability exhibit is OPS-03.

- **Prometheus** scrapes `checkout-sim`, the ingress gateway, kube-state-metrics, node exporter and
  Argo CD's own metrics. Argo's metrics matter as much as the workload's: `argocd_app_info` by sync
  and health status, `argocd_app_reconcile` duration, and sync operation timestamps are the raw
  material for the reconciliation-latency SLI.
- **Recording rules** compute the SLIs as explicit ratios over fixed windows, so the SLI definition
  lives in one queryable place rather than being re-derived in each dashboard and alert.
- **Alertmanager** routes burn-rate alerts to a receiver the drill harness records. There is no
  paging integration, because there is nobody to page, and pretending otherwise would be a
  fabrication of exactly the kind section 0 forbids.
- **Snapshots.** At the end of each drill the harness exports the relevant Prometheus series as a
  file committed alongside the drill record, so a reviewer can verify the numbers without the
  cluster existing. This is what makes evidence survive teardown, and it is the mechanism that lets
  the whole environment be ephemeral without the evidence being ephemeral.

---

## 9. SLOs and error budgets

**Everything in this section is a target with a measurement method. No value here is a result.**

### 9.1 The SLIs

Each SLI is defined as good events over valid events, measured at the point the user would
experience it, with the query specified in `docs/slo/` and implemented as a recording rule.

| SLI                      | Good event                                                                         | Valid events                                       | Measured at                                        |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| Request availability     | HTTP response with status < 500                                                    | All requests to `checkout-sim` through the gateway | Ingress gateway metrics, not application metrics   |
| Request latency          | Response served within the latency threshold                                       | All non-5xx requests                               | Ingress gateway histogram                          |
| Reconciliation freshness | Commit whose Application reaches `Synced` and `Healthy` within the target interval | All commits to `main` touching a deployed overlay  | Git commit time → Argo `operationState.finishedAt` |
| Drift correction         | Out-of-band mutation reverted within the target interval                           | All detected drift events                          | Audit-log mutation time → Argo self-heal time      |
| Rollback latency         | Revert commit reaching `Synced` and `Healthy` within the target interval           | All revert commits in drills                       | Revert merge time → healthy time                   |

Availability is measured at the gateway rather than at the pod deliberately: a pod can be perfectly
healthy while the service is unreachable, and the SLI must reflect what a caller would see. Section
10.2 exists to make that distinction visible.

### 9.2 Objectives

These are objectives to be met and proved, scoped to a measurement window (9.4).

| Objective                | Target                 | Window       | Verified by                                       |
| ------------------------ | ---------------------- | ------------ | ------------------------------------------------- |
| Request availability     | ≥ 99.9% of requests    | Drill window | Gateway metrics, exported snapshot                |
| Request latency          | ≥ 99% within threshold | Drill window | Gateway histogram, exported snapshot              |
| Reconciliation freshness | ≥ 95% of commits       | Drill window | Paired commit/sync timestamps in the drill record |
| Drift correction         | ≥ 99% of events        | Drill window | Drift records in `drills/records/drift/`          |
| Rollback latency         | p50 and p95 reported   | ≥ 10 runs    | Drill records; both percentiles published         |

Rollback latency is deliberately not given a single pass/fail threshold before the harness has run
ten times. Setting a threshold first and measuring second is how targets get chosen to match
whatever the system happens to do. The honest sequence is: build the harness, run it enough times
to see the distribution, publish the distribution, then set a threshold and defend it. Until that
has happened the cell says what will be reported, not what will be achieved.

### 9.3 Error budgets and burn-rate alerting

The budget is the complement of the objective over the window: at 99.9%, one request in a thousand
may fail. Alerting uses multi-window, multi-burn-rate conditions rather than a simple threshold,
because a single-window alert either pages on noise or arrives after the budget is gone:

- **Fast burn:** a high burn rate sustained over a short window _and_ confirmed over a shorter
  sub-window. Catches a total outage quickly while requiring the sub-window to agree, which
  suppresses single-scrape noise.
- **Slow burn:** a lower burn rate over a longer window. Catches the steady 0.5%-error regression
  that a fast-burn alert never sees.

**Honest limitation, stated rather than hidden.** Standard burn-rate practice uses windows of hours
and days against a 30-day budget. This environment does not exist for 30 days (3.1). The exhibit
therefore uses _compressed_ windows scaled to the drill window, and every alert rule, dashboard and
drill record is labelled `compressed-window` with the scaling factor recorded. A compressed-window
burn alert demonstrates the _mechanism_ correctly and does **not** support a statement about
long-run reliability. Section 12 records this as a required entry in the manifest's
`content.limitations`.

### 9.4 What a burned budget actually changes

An error budget that changes nothing is a dashboard. This one is wired to a required status check.

1. The drill harness writes a budget report into `drills/records/` at the end of every window:
   objective, window, valid events, good events, budget consumed.
2. A required check, `error-budget-gate`, reads the most recent report for the target environment.
   If remaining budget for a given exhibit is at or below zero, the check **fails** for pull
   requests touching that exhibit.
3. A failed gate is cleared one of three ways, all of which leave a record: the pull request carries
   a `reliability-fix` label, asserting that it reduces rather than adds risk; the budget report is
   superseded by a new window; or a dated waiver is committed to `docs/adr/` with a named reason.
   There is no fourth way, and specifically there is no way to clear it by editing the objective —
   PRD 12.2 forbids changing thresholds to make checks pass, and the same rule applies here.
4. While the gate is failing, the affected exhibit's Argo Application remains fully automated. The
   budget stops _new feature risk_; it must never stop the reconciler, because a frozen reconciler
   is a drifting cluster.

The last point is the one worth arguing. It is tempting to pause auto-sync when the budget burns.
That is backwards: the reason the budget burned is almost always something that _is_ deployed, and
freezing reconciliation freezes the broken state in place while also disabling the self-heal that
protects everything else in the cluster. The freeze belongs at the merge gate, not at the
reconciler.

---

## 10. The rollback demonstration

This is the exhibit's point. Every drill is a file, runs from one command, and produces a schema-
validated record. A drill that cannot be re-run by a reviewer is an anecdote.

### 10.1 The harness contract

A drill definition (`exhibits/OPS-NN/drills/*.yaml`, schema in `drills/schema/`) declares:
preconditions; the load profile; the fault, as a specific commit or a specific `checkout-sim`
failure mode; the expected observable sequence; the recovery action; and the timing points to
capture. `drills/harness` executes it and writes a record containing: repository SHA, image digests,
cluster identifier and Kubernetes version, environment tier, load profile, the full timeline with
timestamps, every SLI value over the window, the raw Prometheus and Argo exports, and whether each
expected observation occurred.

Reproducibility requirements, all mechanical:

- Images are pinned by digest. The broken build is the same binary as the healthy one with a
  failure mode selected by environment variable, so "broken" is a configuration, not a second
  artefact that can drift.
- The load generator runs a fixed request rate, fixed mix and fixed duration, seeded.
- Cluster shape is fixed by the overlay; node count and instance type are recorded in the record.
- Timing points come from API timestamps (Argo `operationState`, Kubernetes event times, Git commit
  times), never from wall clock in a shell script.
- The record schema is validated in CI; a malformed record fails the drill.

### 10.2 DR-01 — the failure readiness catches

**Fault.** A commit changes `checkout-sim`'s image digest to the `readiness-never-ready` build.

**What should happen.** Argo syncs the new digest. The Deployment uses `maxUnavailable: 0` and
`maxSurge: 1`, so a new pod is created before any old pod is removed. The new pod starts, never
passes readiness, is never added to the Service endpoints, and the rollout stalls. Old pods keep
serving. After `progressDeadlineSeconds` the rollout is marked failed and Argo reports the
Application `Degraded`.

**What a reviewer observes.** The Argo Application turns `Degraded` with a progress-deadline
message; the Deployment shows the old replica count ready and one new pod never ready; the endpoint
list never contains the new pod; and — this is the instructive part — **the availability SLI does
not move.** A correctly configured rollout absorbs this failure class without user impact.

**Recovery.** `git revert` of the offending commit, merged. Argo reconciles the previous digest and
the stalled pod is removed.

**Measured.** Merge of the bad commit → `Degraded`; revert merge → `Synced` and `Healthy`; peak
requests served by the broken pod, which should be zero. The rollback claim being demonstrated is
narrow and precise: **rollback is a revert, not a `kubectl` command**, and the recovery path is the
same path as the deploy path, so it is exercised continuously rather than only in emergencies.

### 10.3 DR-02 — the failure readiness cannot catch

**Fault.** A configuration commit sets `ERROR_RATE=0.3`. The process is healthy: it starts, it
passes readiness, it responds. Thirty percent of its responses are 500s.

**What should happen.** The rollout completes normally. Argo reports `Synced` and `Healthy`.
Kubernetes is satisfied. Error rate at the gateway jumps, the fast-burn alert fires, and the budget
begins to burn immediately.

**What a reviewer observes.** A green Argo UI and a firing alert, side by side. This contrast is
the most valuable frame in the exhibit: **health checks verify the process, SLIs verify the
service, and they are not the same claim.** Everything OPS-07 (canary analysis) exists to solve is
visible in this one screenshot.

**Recovery.** Revert, triggered by the alert rather than by the deploy status.

**Measured.** Fault merge → alert fire (detection); alert → revert merge (human decision time,
recorded but not targeted, because a single-operator drill cannot produce a meaningful decision-time
distribution and claiming otherwise would be fabrication); revert merge → SLI recovery. Budget
consumed during the window is reported as a measured quantity of that drill window and is labelled
`compressed-window` per 9.3.

### 10.4 DR-03 — drift

**Fault.** A human runs `kubectl set image` and `kubectl scale` directly against the live
Deployment, out of band.

**What should happen.** Argo detects the difference within the reconcile interval, reports
`OutOfSync` with the specific field diff, and self-heals to the Git state.

**What a reviewer observes.** The manual change taking effect, then being silently and completely
undone, with the drift record naming the actor from the audit log.

**Measured.** Mutation → detection, and detection → correction. Detection latency is bounded by the
poll interval, so the drill runs twice — once with a repository webhook configured and once without
— to show the difference between "reconciled on change" and "reconciled on schedule", which is a
distinction most GitOps descriptions blur.

### 10.5 DR-04 — the rollback that must not be automatic

**Fault.** A release includes a destructive schema migration against a stateful dependency.

**What should happen.** Nothing automatic. This drill is a documented _refusal_: reverting the
application commit restores the previous binary against a database whose schema no longer matches
it, which turns a bad deploy into a data incident. The drill demonstrates the detection and the
decision — the runbook path, the expand/contract migration pattern that would have avoided it, and
the explicit handoff to OPS-08 — rather than a recovery.

It is included because an exhibit that only shows the cases its mechanism handles is advertising,
not engineering. Naming the boundary of the technique is part of demonstrating that the technique
is understood.

### 10.6 DR-05 — the reconciler's own upgrade

**Fault.** Upgrade Argo CD itself, the one shared-fate component identified in 5.7.

**What should happen.** The Application managing Argo is the only one on a manual sync window,
precisely because an Application that manages its own controller can strand itself mid-upgrade.
The drill demonstrates the ordered upgrade, verifies every other Application resumes reconciling
afterwards, and demonstrates the documented recovery from a stranded controller.

### 10.7 What the drills produce

For the portfolio: a table of timings with a distribution rather than a single number, a short
recording of DR-01 and DR-02, the committed records with their raw exports, and a runbook per drill.
For the repository: a regression suite. The drills run on a schedule, and a change that makes
rollback slower fails the same way a performance regression fails.

---

## 11. Moving from proof level `code` to `measured`

The manifest records `proofLevel: code`. The portfolio's ladder is `code` → `live` →
`measured` → `externally-validated` (`content/taxonomy/closed-enums.v1.json`). This section states
exactly what must exist for each promotion. Nothing here may be claimed before the artefact exists;
PRD 5.1.3 rejects a public project with missing summary, roles, proof level, status, primary
evidence, image alt text or canonical URL, and rejects any metric lacking environment, measurement
date, evidence and synthetic status.

### 11.1 To stay at `code` and be publishable at all

- `status` moves `planned` → `in-progress`, with a real `dates.started`.
- `content.problem` populated from section 1.
- `stack` populated with what is actually in the repository (section 12 lists the intended set).
- At least one primary evidence record — the repository itself, plus the architecture diagram —
  with `verifiedAt` set to a real date.
- Card and hero media with intrinsic width, height and alt text.

### 11.2 To reach `live`

- An environment that a reviewer can observe rather than read about. Given 3.1 there is no
  permanently running cluster, so `live` here means: a scheduled workflow whose run history is
  public, whose logs show the environment being created, drilled and destroyed, and whose artefacts
  are retrievable. The evidence is the reproducible run, not a URL that responds.
- Evidence records of type `runbook` and `architecture-diagram`.
- A recorded walkthrough (`demo-video`) of DR-01 and DR-02 end to end.

### 11.3 To reach `measured`

All of the following must exist. Each row names the artefact and the measurement that backs it.

| Requirement                 | Artefact                                                                                         | Evidence type           |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------- |
| SLI definitions             | `docs/slo/` with each SLI as a queryable recording rule, not prose                               | `slo`                   |
| Objectives and budgets      | The 9.2 table with thresholds committed, plus the compressed-window scaling factor               | `slo`                   |
| Rollback distribution       | ≥ 10 DR-01 runs and ≥ 10 DR-02 runs, p50 and p95 for each, raw records committed                 | `benchmark`             |
| Drift correction            | ≥ 10 DR-03 runs, webhook and poll variants separated, raw records committed                      | `benchmark`             |
| Reconciliation freshness    | Commit-to-healthy timings across every merge in the measurement window, not a hand-picked subset | `benchmark`             |
| Policy enforcement proof    | Admission rejection logs per policy, plus the policy unit-test report                            | `test-report`           |
| Supply-chain proof          | Signature verification records for admitted images                                               | `sbom`                  |
| One real failure, analysed  | A blameless postmortem of something that actually went wrong in building this, not a simulation  | `postmortem`            |
| Environment reproducibility | A recorded teardown-and-rebuild proving the cluster can be recreated from the repository alone   | `runbook` + `benchmark` |

Every resulting metric must be written to the manifest's `metrics` array with `category` from
`content/taxonomy/metrics.v1.json` (`reliability` for availability and drift ratios, `latency` for
rollback and reconciliation timings), a unit whose dimension matches the category, `environment`
describing the cluster shape, load profile and window, `sampleSize` equal to the run count,
`synthetic: true` — because the load is synthetic and there are no real users — `measuredAt`, and an
`evidenceUrl` resolving to the committed record.

The `synthetic: true` flag is not a formality. Every number this exhibit can produce comes from
generated load against a service with no users. Marking them synthetic is the difference between a
measured exhibit and a dishonest one, and PRD 0.10 requires it.

### 11.4 To reach `externally-validated`

Out of scope for now, and stated so the ladder is not left implying an easy last step. It would
require something outside the author's control: an accepted upstream contribution to one of the
components used here, or a third party independently reproducing a drill. Neither can be planned
into existence.

---

## 12. Reconciliation with the manifest

PRD 5.1.1 fixes precedence: human-authored manifest fields win over any document. Everything below
is a **proposal for a manifest change**, flagged where it goes beyond what the manifest currently
records. Nothing here is true until the manifest says it.

**Consistent with the manifest as it stands.** `id`, `slug`, `title`, `summary`, `tier: keystone`,
`track: cloud-sre`, `status: planned`, `proofLevel: code`, `visibility: unlisted`,
`complexity: distributed-system`, `domains: [infrastructure]`, `roles: [backend-engineer,
ai-engineer]`, `ownership.kind: solo`, and the `layout` block. This document does not contradict
any of them.

**Beyond the current manifest — proposed additions.**

1. **`content.problem`** is `null`. Section 1 specifies it. This is the largest single addition.
2. **`stack`** is empty in all six arrays. Proposed: `languages: [hcl, go, bash, sql?]` — `sql` only
   if the stateful drill materialises; `infrastructure: [kubernetes, terraform, argocd,
github-actions, prometheus, kustomize]` plus the policy engine and signing tool, each subject to
   the taxonomy being extended by reviewed change per rule `TAX-UNKNOWN-001`; `testing:` the drill
   harness and policy test tooling. Several of these terms may not yet exist in
   `content/taxonomy/technology.v1.json` and would require a reviewed taxonomy addition before the
   manifest validates.
3. **`capabilities`** currently records `sre` and `observability`. This document's scope also
   exercises `security` (image provenance, admission, network isolation) and `system-design`. Adding
   them is a judgement call for the manifest owner; flagged, not assumed. Adding `security` in
   particular changes which facet queries surface this project.
4. **`content.limitations`** is empty and must not stay empty. At minimum: the environment is
   window-scoped rather than continuously running (3.1); burn-rate windows are compressed and
   labelled as such (9.3); all load is synthetic with no real users (11.3); stateful rollback is
   explicitly out of scope (10.5).
5. **No `repository` field exists** in the manifest. The schema example in PRD 8 has one. The
   repository name `reliability-forge` comes from `docs/prd/portfolio-project-selection.md` line 188
   and `content/taxonomy/tracks.v1.json`, not from the manifest.
6. **`metrics` and `evidence` stay empty** until section 11.3's artefacts exist. This document
   proposes their eventual shape and proposes nothing about their values.
7. **`dates`** stay null. They are filled when the work happens, from real timestamps.

---

## 13. Risks

| Risk                                                                            | Mitigation                                                                                                                  |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| The `lab` tier survives a failed teardown and bills indefinitely                | `always()` teardown step, a scheduled orphan sweeper keyed on resource age and environment tag, and a budget alarm          |
| Drill timings are dominated by CI queueing rather than by the system under test | Timing points come from Argo and Kubernetes API timestamps, never from workflow wall clock; queue time recorded separately  |
| Fifteen exhibits in one cluster collide on cluster-scoped objects               | Empty `clusterResourceWhitelist` by default; cluster-scoped objects live only in `platform/` (5.4)                          |
| The compressed-window SLO gets quoted later without its qualifier               | The label is part of the metric `environment` string and part of `content.limitations`, so it travels with the number       |
| Policy set grows until developers bypass it                                     | Audit-first with dated expiry (7.3); every policy has pass and fail fixtures; the CI check uses the same files as admission |
| Scope creep from the fourteen sibling exhibits into OPS-01                      | Section 3 non-goals name each sibling explicitly; `exhibit.yaml` and the boundary checker enforce the split                 |
| Rollback timings are cherry-picked from favourable runs                         | Every run writes a record; the published figure is a distribution over all records in the window, not a best case           |

---

## 14. Open questions

1. Which cloud, and does that decision belong here or in OPS-02? OPS-02 is the landing-zone exhibit
   and arguably owns the choice; OPS-01 consumes it. Sequencing OPS-02 first would give OPS-01 a
   real network and IAM foundation, at the cost of delaying the keystone.
2. How long is a `lab` window, and how many windows are needed before the rollback distribution is
   worth publishing? The section 11.3 floor of ten runs is a minimum, not an answer.
3. Does `checkout-sim` belong in this repository or in its own? Keeping it here makes the drills
   self-contained; moving it out makes the "deploy an external service" story more honest.
4. Should the `local` tier's Argo run the same version as `lab`? Pinning them together removes a
   class of "works locally" surprises and makes DR-05 harder to schedule.
