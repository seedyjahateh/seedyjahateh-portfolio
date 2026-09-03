"use client";

/**
 * Desktop activation.
 *
 * Authority: ADR 0036, PRD 9.4 (`JS-HOME` 135 KB).
 *
 * WHY THIS IMPORT IS STATIC, UNLIKE THE PALETTE'S. `palette-stub.tsx` hides the
 * dialog behind `import()` because the palette is on-demand: nobody pays for it
 * until they press a key. The desktop is not on-demand — it is the page, on
 * every route, immediately. Behind a dynamic import its cost would land in a
 * chunk `scripts/measure-routes.ts` never counts, because that script reads the
 * `<script src>` tags in the exported HTML and a runtime `import()` is not one.
 * The budget would read 107.7 KB while the visitor downloaded 120.
 *
 * So it is imported normally, lands in the layout chunk, and is counted.
 * `JS-HOME` was raised from 110 to 135 in ADR 0036 to carry exactly this, which
 * only means anything if the thing it was raised for is actually weighed.
 *
 * It renders `null`. Every pixel the desktop shows is markup the server already
 * sent, so there is no hydration mismatch and nothing is painted twice.
 */

import { useEffect } from "react";

import { startDesktop } from "./desktop-shell";

export function DesktopStub() {
  useEffect(() => {
    const stop = startDesktop();

    /**
     * Hydration signal, for the same reason `data-palette-ready` exists: until
     * this effect runs the page is the plain document, and a test that looks
     * for a window before then is racing rather than failing. It also tells
     * anyone debugging a live page whether the shell ran at all.
     */
    document.documentElement.dataset["desktopReady"] = "";

    return () => {
      delete document.documentElement.dataset["desktopReady"];
      stop();
    };
  }, []);

  return null;
}
