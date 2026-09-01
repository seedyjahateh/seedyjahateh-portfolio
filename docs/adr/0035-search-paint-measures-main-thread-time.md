# ADR 0035 - SEARCH-PAINT measures main-thread time, not wall clock

- Status: accepted
- Date: 2026-09-01
- Phase: 4

## Context

`SEARCH-PAINT` budgets 16 ms (PRD 5.2.3). ADR 0033 fixed how it was sampled —
a double `requestAnimationFrame` had been reporting 31.8 ms, roughly a frame of
which was the technique — and after that fix it passed.

Phase 4's match highlighting regressed it to 17.1 ms. PRD 12.2 is explicit that
a budget is not raised to make something pass, so the response was to make the
work cheaper. Four rounds went in: the suggestion list was capped, the listbox
click handler was delegated instead of re-bound twelve times per render, a
`textContent` fast path was added for the unhighlighted case, and the option
rows were pooled instead of destroyed and rebuilt on every keystroke.

Across those four rounds CI reported 17.1, 16.6, 17.5, 16.5 and 17.6 ms. The
number did not move. It did not move because it never depended on the work.

## What measurement found

The measured interval was split at the frame boundary that
`requestAnimationFrame` reports, separating the application's own cost from the
browser's. On CI, at 1,300 records:

| Component               | p95     |
| ----------------------- | ------- |
| Work — building the DOM | 0.3 ms  |
| Waiting for a frame     | 17.3 ms |
| Wall clock, end to end  | 17.6 ms |

Ninety-eight percent of what the budget was being compared against was the
interval between one frame and the next.

This makes the comparison unsatisfiable rather than merely strict. `atlas:paint`
closes after the browser paints, so it necessarily contains the wait for the
next frame boundary — up to a full frame. A budget of 16 ms is one frame. A
handler that did nothing at all would still measure a frame and still fail. No
implementation can pass it, so it was never reporting anything about the
implementation.

## Decision

**`SEARCH-PAINT` is compared against `atlas:paint:main`: work plus style,
layout and paint. The budget value stays 16 ms.**

`measureAfterPaint` now emits four measures instead of one:

```
startedAt ....... enteredAt ......... frameStart ......... painted
          |<- work ->|<- idle wait ->|<- style/layout/paint ->|
```

- `:work` — the synchronous handler.
- `:wait` — the browser choosing when the next frame is. No engineering
  shortens it.
- `:render` — style, layout and paint for the mutations just made.
- `:main` — `work + render`. Every millisecond of main-thread time spent on
  this interaction's behalf, and nothing spent waiting.

`:render` is deliberately inside the gate. Excluding it would leave only the
handler, and a handler can be instant while the DOM change it makes is
ruinous — a layout-thrashing mutation would then be invisible. Both halves are
this code's responsibility, so both are gated.

The wall-clock number is still reported on every run, as are all four
components. It is what a person actually waits for and it must stay visible;
it is simply not the thing PRD 5.2.3 names.

### Why this is not raising a budget

`config/budgets.v1.json` is untouched. What changed is the instrument, and it
changed towards what the PRD already said: "main-thread **work** from a
completed query through painted results". The clause bounds which work counts,
and the 16 ms value is a frame — the shape of a budget meaning "fit inside a
frame", not "elapsed time including a frame".

The distinction that keeps this honest is that the old comparison could not be
passed by any implementation. Correcting a measurement no code can satisfy is
not the same as relaxing one that is merely hard.

### Why FILTER-TO-PAINT and PALETTE-OPEN are left as wall clock

They budget 32 ms and 50 ms. Neither is one frame, so both accommodate a frame
interval and still leave room to measure something real; neither is
unsatisfiable by construction. They now emit the same four-way split, so if
either tightens, the reason will already be on the run that shows it.

## Consequences

- `SEARCH-PAINT` gates a number the code controls. At 0.3 ms of work the
  headroom is large, which is what a budget with headroom looks like — it will
  still catch a synchronous render of the full result set.
- Four rounds of optimisation were spent on a quantity that was never the cost.
  The work was real and is kept, but the sequence was wrong: the split should
  have been measured before anything was changed. Five CI runs showed a flat
  number and were read as noise rather than as evidence that the lever was not
  connected.
- Every consumer of `measureAfterPaint` gains the split at no cost.

## Revisit trigger

If `:render` p95 rises above about 5 ms, the DOM mutations have become
expensive and the row updates need looking at rather than the handler.

If `:wait` p95 drifts far from one frame interval, the runner is not painting
at a steady rate and the samples are measuring the machine.
