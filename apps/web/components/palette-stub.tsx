"use client";

/**
 * Command palette activation stub.
 *
 * Authority: PRD 5.2.1 (entry keys and the ≤50 ms open budget, preload on
 * hover/focus/idle), 9.4 `JS-HOME` = 110 KB, ADR 0028 ("Phase 3 has to fit a
 * search worker into 3 KB of remaining home budget").
 *
 * THIS FILE EXISTS TO BE SMALL. Home measured 106.9 KB of 110 KB before Phase 3
 * began, so everything the palette needs — the dialog, Fuse, the worker, the
 * engine — is behind a dynamic import and lands in its own chunk. What ships in
 * the initial bundle is only this: one keydown listener and the code to fetch
 * the rest.
 *
 * PRD 12.2 forbids raising a budget to make something fit, so if this ever
 * stops fitting, the answer is to remove something else — not to move the line.
 *
 * It renders `null`. The visible search affordance is a real <form> rendered on
 * the server (see search-form.tsx), which is also the no-JS fallback. So there
 * is no hydration mismatch to guard against and no UI to paint twice.
 */

import { useEffect } from "react";

// Type-only, so it is erased at build time and pulls no dialog code into this
// chunk. The runtime reference is the dynamic import() below — that is what
// creates the separate chunk this file exists to keep separate.
import type * as PaletteDialog from "./palette-dialog";

/** PRD 5.2.1: idle delay before speculatively preloading the palette. */
const PRELOAD_IDLE_MS = 2000;

/** Loaded at most once, whichever trigger fires first. */
let pending: Promise<typeof PaletteDialog> | null = null;

function loadPalette(): Promise<typeof PaletteDialog> {
  pending ??= import("./palette-dialog");
  return pending;
}

/**
 * True when a keystroke should be left alone.
 *
 * PRD 5.2.1 scopes the bare `/` shortcut to "when focus is not inside an
 * editable field" — otherwise typing a slash into the search box would reopen
 * the palette on top of itself. Meta/Ctrl+K is intentionally NOT subject to
 * this: it is a deliberate chord and should work from anywhere.
 */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable
  );
}

export function PaletteStub() {
  useEffect(() => {
    const open = (initialQuery: string): void => {
      // PALETTE-OPEN (PRD 5.2.1, <=50 ms). The clock starts at the command, not
      // after the chunk arrives — a palette that takes 300 ms to fetch its own
      // code has not opened in 50 ms, however fast it renders once here.
      const startedAt = performance.now();
      void loadPalette().then((mod) => {
        mod.openPalette(initialQuery, startedAt);
      });
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;

      const chord = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;

      if (chord || (slash && !isEditable(event.target))) {
        event.preventDefault();
        open("");
      }
    };

    // The server-rendered form is the trigger. Intercepting submit keeps the
    // markup as the single source of the affordance: with JS the palette opens,
    // without it the same form navigates to /projects?q=… unchanged.
    const form = document.querySelector<HTMLFormElement>("form[role='search']");
    const input = form?.querySelector<HTMLInputElement>("[data-search-input]") ?? null;

    const onSubmit = (event: SubmitEvent): void => {
      event.preventDefault();
      open(input?.value ?? "");
    };

    // PRD 5.2.1: preload on the earliest of hover, focus, or a 2s idle callback.
    const preload = (): void => void loadPalette();

    /**
     * The DOM lib declares requestIdleCallback as always present on Window, so
     * neither `in` narrowing nor an intersection can express its absence — one
     * makes the fallback branch `never`, the other is silently overridden by
     * Window's own non-optional declaration.
     *
     * Assigning to a standalone type that omits Window states the real
     * situation: the method is optional at runtime. Safari only shipped it in
     * 16.4, so the setTimeout fallback is load-bearing, not defensive.
     */
    const idleWindow: {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    } = window;

    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    if (idleWindow.requestIdleCallback) {
      idleHandle = idleWindow.requestIdleCallback(preload, { timeout: PRELOAD_IDLE_MS });
    } else {
      timeoutHandle = window.setTimeout(preload, PRELOAD_IDLE_MS);
    }

    document.addEventListener("keydown", onKeyDown);
    form?.addEventListener("submit", onSubmit);
    form?.addEventListener("pointerenter", preload, { once: true });
    input?.addEventListener("focus", preload, { once: true });

    /**
     * Hydration signal.
     *
     * Until this effect runs, Ctrl+K does nothing — the markup is inert HTML.
     * Tests that press the chord before hydration fail intermittently, and
     * "wait a bit" hides the race rather than removing it. This gives them
     * something real to wait for, and gives anyone debugging a live page a way
     * to tell "not hydrated yet" from "listener is broken".
     */
    document.documentElement.dataset["paletteReady"] = "";

    return () => {
      delete document.documentElement.dataset["paletteReady"];
      document.removeEventListener("keydown", onKeyDown);
      form?.removeEventListener("submit", onSubmit);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, []);

  return null;
}
