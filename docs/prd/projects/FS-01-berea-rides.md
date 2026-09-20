# FS-01 — Berea Rides Campus Mobility Network

**Record:** `content/projects/FS-01.json` · **Track 10** (full-stack commercial product) ·
**Tier:** keystone · **Status:** in-progress · **Proof level:** `code` · **Started:** 2026-02-01

**Repository:** `berea-rides` — its own repository. Track 10's repository strategy is "one
repository per serious product; smaller products may share `product-studio`", and this is a
registered company with a beta behind it rather than an exhibit.

> This document describes a system that exists. It is not a build plan, and it deliberately does
> not read like the four planned keystones. Where a section describes something that was built,
> it says so; where it describes something that is specified but absent, it says that instead.
> The manifest is authoritative (PRD 5.1.1) and its five recorded limitations are reproduced here
> rather than softened — they are the reason this project is at proof level `code` and not higher.

---

## 1. Why this document exists

Berea Rides was founded, built and beta-tested before any of it was written down as a
specification. That is the normal order for a product and the wrong order for a portfolio: the
archive's whole claim is that every assertion has evidence behind it, and an unwritten system
cannot be reviewed, evaluated or defended.

So this document has two jobs, and they pull in different directions.

The first is **to record what was actually built and why**, including the decisions that look
wrong until you know the constraint behind them. The matching rule is the clearest case: it is
deliberately coarser than two earlier versions, and without the regulatory reason that looks like
a retreat rather than a correction.

The second is **to name the gap between what exists and what can be proved.** The manifest records
that campus beta usage was never instrumented, so there are no measured results and cannot
retroactively be any. No amount of writing changes that. What a specification can do is define the
measurements precisely enough that the next beta produces them, and structure the code so the one
component that most needs evaluating can actually be evaluated in isolation.

Section 7 and section 9 are where those two jobs meet: the repository layout is not a tidiness
exercise, it is the mechanism that makes the matching rule testable against a fixture corpus.

## 2. The problem

The manifest states the problem as: "Students on a residential campus of 1,600+ coordinate rides
to town, airports, and home through group chats, where offers and requests are easily missed and
there is no record of who committed to what."

The campus is not named in the record and is not named here. Most students do not keep a car, and
getting to town, to the airport at the start and end of term, or home for a break is a
coordination problem solved almost entirely in group chats.

Group chats fail at this in three specific ways:

- **Offers and requests are ephemeral.** A message scrolls away in minutes. Someone offering three
  seats to Lexington on Friday and someone needing one on Friday frequently never see each other,
  not because no match existed but because the two messages were forty minutes apart.
- **There is no record of commitment.** "I'll take you" in a thread of two hundred people is not a
  booking. Nobody can tell later who agreed to what, and no-shows have no cost.
- **There is no identity.** A group chat's membership is whoever was added. A rider accepting a
  lift from a name they do not recognise is trusting the group's moderation, which is nobody's job.

The product replaces the coordination layer, not the transport. Drivers are already making the
trip. The system's value is making an existing seat discoverable and the agreement to fill it
durable.

### 2.1 Who it is for

Two sides, asymmetric in motivation:

**Drivers** are students already travelling for their own reasons. They are not seeking work and
will not accept meaningful friction, detour, or obligation. Any design that treats them as supply
to be dispatched loses them immediately — and, as section 3 explains, would also be illegal.

**Riders** need a seat on a route they do not control, usually on a date fixed by the academic
calendar. They tolerate more friction than drivers because they have fewer options.

The asymmetry drives the interaction model: riders search and request, drivers accept or decline.
Nothing is ever assigned to a driver.

## 3. The constraint that shapes everything: this is a carpool, not a ride-hail

This is the most important section in the document, and the one whose absence would make several
later decisions look like sloppiness.

Kentucky exempts carpooling from for-hire transport regulation only where the trip is **incidental
to the driver's own purpose** — the driver was going anyway, and the passenger is sharing a journey
that would have happened regardless. A driver who begins taking trips _in order to_ carry
passengers is operating a for-hire vehicle service, with the licensing, insurance and commercial
obligations that follow.

The exemption is therefore not a legal footnote sitting beside the product. It is a **constraint on
what the matching algorithm is allowed to do**, and it inverts the usual objective:

- A ride-hail matcher maximises coverage. Its failure mode is an unserved rider.
- A carpool matcher must **decline** matches that would make the driver's trip non-incidental. Its
  failure mode is a match it should have refused.

A system that matched aggressively would be optimising its way out of the exemption its users
depend on. Every design decision in section 4 follows from taking that seriously.

### 3.1 What this rules out permanently

These are non-goals in the strong sense — not "later", but "not without becoming a different,
regulated company":

- **Dispatch.** The system never directs a driver to a rider. Drivers publish trips they are
  already taking.
- **Detour optimisation.** No feature may encourage a driver to deviate for pickup. Detour is
  precisely what converts an incidental trip into a service.
- **Surge, fares, or driver earnings.** Cost-sharing between students is one thing; a fare schedule
  the platform sets is another, and it is the clearest possible evidence of a for-hire operation.
- **Driver supply management.** No incentives to drive, no targets, no acceptance-rate pressure.
- **Expansion to non-students.** Verified campus membership is both the trust model and part of the
  incidental-travel argument.

## 4. The matching rule, and why it got coarser

### 4.1 What was tried

Two successive designs treated matching as a geometry problem: given the driver's route and the
rider's origin and destination, decide whether the rider is "on the way".

The first computed a corridor around the driver's polyline and tested whether both rider endpoints
fell inside it. The second was more precise — it took the driver's route, inserted the rider's
pickup and drop-off, recomputed the route, and compared the detour against a threshold.

**Both rejected obvious carpools.** The manifest records this plainly. A rider a short walk off a
tight corridor is a carpool by any sensible reading, and the corridor said no. A rural route with
one viable road produced a large proportional detour for a pickup that cost the driver almost
nothing in practice, and the detour test said no.

The precision was real, and it was measuring the wrong thing. Both gates answered "is this rider
geometrically close to the route", when the legal question is "is this trip still incidental to the
driver's own purpose" — and that question has an element no geometry can see. Whether a five-minute
stop is incidental depends on whether the driver minds, which is information the driver has and the
algorithm does not.

### 4.2 The design that shipped

The rule was made **deliberately coarser, with the judgement moved to the driver at accept time.**

The algorithm's job is reduced to _candidate generation_: it proposes riders whose journey plausibly
overlaps the driver's, using a wide and forgiving notion of overlap. It does not adjudicate.
The driver sees the pickup and drop-off and accepts or declines — and because the driver is the
person whose trip's character is in question, the driver is the correct decision-maker for it.

This is a genuine trade, and the manifest records the cost as limitation five: **compliance now
depends partly on driver judgement, which is less auditable than an algorithmic threshold.** A
regulator asking "how do you ensure trips remain incidental" gets a weaker answer than a crisp
numeric gate would give — but the crisp gate's answer was also false, because it rejected real
carpools and would have pushed users back to the group chat it replaced.

The defensible position is the honest one: the platform generates candidates permissively, presents
the full trip to the driver before commitment, and never applies pressure to accept. What makes
that credible is the absence of every mechanism in section 3.1 — with no dispatch, no fares and no
supply targets, there is no force acting on the driver to accept a trip they would not otherwise
take.

### 4.3 What is not yet known about it

Limitation four, stated in full: the matching gate has **no measured false-rejection rate** and
**has not been compared against a naive proximity baseline**. The evidence attached to this record
(`route-overlap-design`) is a design note — a rationale for the decision, not an evaluation of it.

That is the single largest gap in the project, and section 9 treats closing it as the primary
route from `code` to `measured`. The claim "the coarser rule is better" is currently an argument.
It should be a measurement, and it is measurable: the two rejected designs still exist as
specifications, so all three can be run over the same corpus of trips and scored.

## 5. What was built

Recorded in the manifest under ownership responsibilities:

- product definition and beta rollout
- route-overlap matching algorithm
- authentication and session security
- real-time ride-status updates
- mobile client implementation

### 5.1 Shape of the system

A mobile client talking to a managed Postgres backend. There is no bespoke application server.

**Client** — React Native on Expo, TypeScript. Mobile-only, because the product is used standing
outside a residence hall deciding whether to accept a lift, not at a desk.

**Backend** — Supabase over PostgreSQL. Authentication, row-level security, realtime subscriptions
and Postgres itself in one managed service. For a two-sided product at campus scale, run by a
founder who is also the only engineer, the decision that matters is how little operational surface
it creates: no servers, no deploy pipeline for the data layer, and authorisation expressed as
database policy rather than as middleware that can be bypassed by a second code path.

The cost is real and worth stating: authorisation logic lives in SQL policies, which are harder to
unit test than application code and easy to get subtly wrong. Section 7 puts them in a directory
with a test suite for exactly this reason.

**Error reporting** — Sentry.

**Tests** — Jest.

### 5.2 Ride state

A ride moves through a small set of states, and the transitions are the product:

`published` → `requested` → `accepted` → `in-progress` → `completed`, with `cancelled` reachable
from any pre-completion state.

Two properties matter more than the list:

- **Acceptance is the commitment point.** Before it, a request is an enquiry. After it, both sides
  have a record — which is the thing group chats could not provide.
- **State changes propagate in real time.** A rider whose driver cancels needs to know while there
  is still time to find another option, not when they next open the app. This is what the realtime
  subscription is for, and it is why the state machine lives in the database rather than in the
  client.

### 5.3 Identity and access

Accounts are authenticated and tied to campus membership. This does double duty: it is the trust
model riders rely on, and it is part of the argument in section 3 that these are genuinely
incidental trips between members of one community.

Authorisation is enforced by row-level security. The rule that matters: a user may read the details
of a trip they are party to, and only coarse, non-identifying information about trips they are not.
Pickup locations are personal data — a rider's pickup point is usually their residence hall.

## 6. Safety and trust

The product carries real safety weight: it introduces students to each other for time alone in a
vehicle. Three commitments, all of which exist because the alternative is worse rather than because
they are features:

- **No anonymity.** Both parties see who they are travelling with before acceptance. Verified
  campus membership is the floor.
- **A durable record.** Who agreed to what, and when, is stored. This is a deterrent as much as an
  aid to resolution.
- **Cancellation without penalty.** Any mechanism that punishes cancellation pressures a person to
  get into a car they have become uncomfortable about. There is no cancellation fee and no rating
  penalty, and there will not be.

Moderation, blocking and reporting are specified in the Track 10 entry for FS-01 and are **not
built**. They are listed here as specification, not as description.

## 7. Repository layout

The layout exists to make two things true: the regulated core must be evaluable in isolation, and
the authorisation policies must be testable. Everything else follows from an Expo project's
conventions.

```
berea-rides/
├── apps/
│   └── mobile/                 Expo / React Native client
│       ├── src/
│       │   ├── features/       ride publishing, search, requests, trip state
│       │   ├── components/     presentation only
│       │   ├── navigation/
│       │   └── lib/            client-side Supabase access
│       └── app.config.ts
├── packages/
│   ├── matching/               THE REGULATED CORE — see 7.1
│   │   ├── src/
│   │   └── fixtures/           recorded trips, with expected outcomes
│   ├── contracts/              shared types, generated from the database schema
│   └── geo/                    distance, corridor and polyline primitives
├── supabase/
│   ├── migrations/             schema, forward-only
│   ├── policies/               row-level security, one file per table
│   └── functions/              edge functions, if and only if a rule cannot live in SQL
├── evaluation/                 the harness of section 9 — runs matching over fixtures
├── docs/
│   ├── adr/                    decisions, including the section 4 reversal
│   └── prd.md                  this document, mirrored
└── .github/workflows/
```

### 7.1 Module rules

The table is the enforceable part. "Must never import" is the column that does the work.

| Module               | Owns                                         | May depend on          | Must never import                        |
| -------------------- | -------------------------------------------- | ---------------------- | ---------------------------------------- |
| `packages/matching`  | candidate generation; the legal gate         | `geo`, `contracts`     | Supabase, network, React, the filesystem |
| `packages/geo`       | geometric primitives                         | nothing                | everything else in the repo              |
| `packages/contracts` | types shared by client and database          | nothing                | everything else in the repo              |
| `apps/mobile`        | presentation, navigation, client data access | all packages           | `supabase/` internals; raw SQL           |
| `supabase/policies`  | authorisation                                | the schema             | application code                         |
| `evaluation`         | scoring matching against fixtures            | `matching`, `fixtures` | `apps/mobile`, Supabase                  |

**`packages/matching` must be pure.** No I/O, no clock, no network, no database. Given a driver
route and a set of rider journeys it returns candidates, deterministically. This is the single most
important boundary in the repository, and the reason is section 4.3: a rule that cannot be run
offline over a fixture corpus cannot have a false-rejection rate measured, and measuring that is
what moves this project up the proof ladder. Purity is not a style preference here, it is the
precondition for the evidence.

It also means all three designs — corridor, detour, and the coarse rule that shipped — can live
side by side behind one interface and be scored against each other. A historical design kept as a
comparison baseline is worth far more than one deleted.

**Enforcement is mechanical, not cultural.** A convention that `matching` stays pure will be
violated the first time someone needs a config value at 2am. The boundary is enforced by:

- an ESLint `no-restricted-imports` rule per package, failing the build on a forbidden import;
- `packages/matching` declaring no runtime dependencies on Supabase or React in its manifest, so a
  violation fails to resolve rather than merely failing lint;
- a CI job that runs the `matching` test suite with no network available.

**The tradeoff.** This is more structure than a single-product mobile app needs, and it costs real
friction: shared types must be regenerated when the schema changes, and a feature touching the
matching rule spans three directories instead of one. That is accepted because the alternative —
matching logic living inside a React component with a Supabase client in scope — is the version
that can never be evaluated, and evaluation is the point.

### 7.2 Why policies get their own directory and their own tests

Row-level security is the whole authorisation model (5.1), which makes it the highest-risk code in
the repository and the least visible. One file per table, and a test suite that asserts, for each
policy, both what a user may see and what they may not. A policy test that only checks the positive
case is the failure mode here: the bug is never "the owner cannot read their own row", it is "a
stranger can".

## 8. What the beta did and did not establish

The product was beta-tested on campus. The manifest records the limitation precisely:
**usage during the campus beta was not instrumented, so there are no measured results to report.**

That is stated here rather than buried because the temptation to characterise the beta loosely is
exactly what the archive exists to resist. There is no retention figure, no match rate, no
completed-ride count, and none can be reconstructed after the fact.

What the beta did establish is qualitative and still worth recording: the system ran with real
users, the matching rule met real routes, and the two earlier designs were rejected on the evidence
of real trips rather than in the abstract. That is why the project sits at `code` — there is a
working system — and not at `measured`.

Two further limitations bear on how this project can be reviewed at all:

- **`berearides.com` is the product landing page, not the running app.** The build is not publicly
  installable, so a reviewer cannot inspect the system itself.
- **There is no public source or case study yet.**

Anyone assessing this project today is therefore assessing a description. Section 9 is about
changing that.

## 9. From `code` to `measured`

Four artefacts, in dependency order. The first is the one that matters, and the layout in section 7
is what makes it possible.

### 9.1 Evaluate the matching rule

The claim in section 4 — that the coarse rule is better than the two precise ones — is currently an
argument in a design note. Making it a measurement requires:

1. **A fixture corpus.** Real trips from the beta, anonymised: driver route, rider journey, and the
   outcome that actually occurred or that a human reviewer judges correct. Pickup points are
   personal data, so anonymisation is a precondition and not a step to hurry.
2. **A labelled ground truth.** For each pair, whether a reasonable person would call it a carpool.
   This is a human judgement and should be recorded as one, with the labeller and date.
3. **Three implementations behind one interface** — corridor, detour, coarse — run over the corpus.
4. **Reported per design:** false-rejection rate (carpools refused) and false-acceptance rate
   (matches proposed that a driver would reasonably consider a detour). The second matters more
   legally and is the harder label.
5. **A naive proximity baseline**, because limitation four names it specifically. A rule that does
   not beat straight-line distance has not earned its complexity.

Closing this alone is what converts the primary evidence item from a design note into an
evaluation.

### 9.2 Instrument the next beta

Defined before it runs, not after. The minimum that makes the product's central claim checkable:
requests made, requests accepted, time from request to acceptance, and completion versus
cancellation — with cancellations distinguished by side, since a driver cancelling late is a
different failure from a rider changing plans.

Privacy constraints are part of the specification, not a later review: no location traces retained
beyond what a trip requires, and aggregate reporting only.

### 9.3 Make the system inspectable

Either a public build, a screen-recorded walkthrough of the real application, or an open-sourced
subset. `packages/matching` and `packages/geo` are the natural candidates for the last of these:
they contain no credentials and no personal data, and they are the part a reviewer most wants to
read. The directory boundary that makes them evaluable also makes them publishable.

### 9.4 Write the case study

The decision in section 4 — two precise designs rejected in favour of a coarser one, for a
regulatory reason — is the most interesting thing about this project and the strongest evidence of
engineering judgement in the corpus. It is currently a paragraph in a manifest.

### 9.5 The media gap

The card image is 736×1600 portrait and gets centre-cropped. A landscape capture of at least
1200px is needed. This is the smallest item on the list and the only one blocking presentation
rather than proof.

## 10. Risks

**Regulatory posture rests on driver judgement.** Named in the manifest as limitation five and
accepted deliberately in 4.2. The mitigation is structural, not procedural: every mechanism that
would pressure a driver toward a trip they would not otherwise take is absent by design (3.1), and
must stay absent. This is the risk most likely to be eroded by a well-meaning growth feature.

**Safety incidents.** A product that puts students in cars together carries weight no amount of
architecture addresses. Moderation and reporting are specified and unbuilt (section 6), and that
gap should close before any relaunch rather than after.

**Single-maintainer continuity.** One engineer, who is also the founder. The managed backend is a
deliberate response — there is no cluster to keep alive — but the bus factor is one.

**Seasonality.** Demand concentrates around term boundaries and breaks. A beta run in the wrong
fortnight measures an empty system, so 9.2's instrumentation must be live before a peak, not
during a trough.

## 11. Non-goals

Beyond the permanent exclusions in 3.1:

- **Payments.** Informal cost-sharing between students stays between them. Processing money
  introduces settlement, disputes and tax, and moves the platform closer to looking like a
  for-hire operation.
- **Scheduled or recurring rides.** A standing arrangement between two people who now know each
  other does not need the platform, and recurring commitment starts to resemble a service.
- **Web client.** The decision point is on foot (5.1).
- **Expansion beyond the campus** while verified membership is doing the work it does in section 6.
