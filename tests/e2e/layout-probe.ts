/**
 * Forced synchronous layout, counted rather than approximated.
 *
 * Authority: PRD 9.3 — `FORCED-LAYOUTS-SCROLL` is 0 across `scroll:any-view`,
 * and the same section forbids read/write interleaving generally.
 *
 * WHY THIS EXISTS. That budget went unmeasured for three phases. What stood in
 * its place was a CDP `LayoutCount` delta with an honest note attached saying it
 * was not the right number — and it was not: `LayoutCount` counts ALL layout,
 * and a virtualizer lays out legitimately as rows mount, so zero was
 * unachievable and any pass would have been meaningless.
 *
 * The budget does not name layout. It names FORCED layout: a read that has to
 * flush a layout the browser had not got to yet, because something was written
 * first. That is a property of ordering within a task, and it is exactly
 * detectable from inside the page:
 *
 *   - a write to geometry-affecting DOM or CSS marks the document dirty;
 *   - a read of a layout-dependent property while dirty is a forced layout, and
 *     the read flushes, so the flag clears;
 *   - the flag also clears once per frame after paint, because the browser laid
 *     out on its own by then and the next frame's first read is free.
 *
 * That is what DevTools reports as "forced reflow", derived here from the APIs
 * rather than from a trace — so a violation arrives with the stack that caused
 * it rather than a number to go hunting with. It found two on the first run:
 * `relayout` reading a height between writes, and `clamp` reading the surface
 * width on every pointermove of a drag, in a file whose own header said it never
 * read layout on pointermove.
 *
 * WHAT IT COSTS. Every CSS property setter on `CSSStyleDeclaration.prototype` is
 * wrapped, which is real overhead on a page that writes styles per row. Install
 * it only in tests that are measuring this, never alongside a timing budget:
 * that would be measuring an instrumented page and reporting the number as the
 * app's.
 *
 * WHAT IT OVER-REPORTS. A write API that changes nothing — `removeProperty` on a
 * property that was not set — still marks the document dirty here, because this
 * counts calls, not effects. It therefore never misses a forced layout and can
 * name one the browser would have skipped. For a budget of 0 that is the right
 * direction to be wrong in.
 */

import type { Page } from "@playwright/test";

export interface LayoutReading {
  forced: number;
  reads: number;
  writes: number;
  where: string[];
}

export async function installLayoutProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    interface LayoutProbe {
      forced: number;
      reads: number;
      writes: number;
      where: string[];
    }

    const probe: LayoutProbe = { forced: 0, reads: 0, writes: 0, where: [] };
    (window as unknown as { __layout: LayoutProbe }).__layout = probe;

    let dirty = false;

    const onWrite = (): void => {
      probe.writes += 1;
      dirty = true;
    };

    const onRead = (): void => {
      probe.reads += 1;
      if (dirty) {
        probe.forced += 1;
        // The first frames of the stack are this probe; the caller is next.
        if (probe.where.length < 6) {
          const frames = (new Error().stack ?? "").split("\n").slice(3, 6);
          probe.where.push(frames.map((line) => line.trim()).join("  <-  "));
        }
      }
      // The read flushed layout, so the document is clean again whatever it was.
      dirty = false;
    };

    const wrapMethod = (target: object, name: string, hook: () => void): void => {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      if (descriptor === undefined || typeof descriptor.value !== "function") return;
      const original = descriptor.value as (...args: unknown[]) => unknown;
      Object.defineProperty(target, name, {
        ...descriptor,
        value: function (this: unknown, ...args: unknown[]): unknown {
          hook();
          return original.apply(this, args);
        },
      });
    };

    /**
     * `unbound-method` is disabled on the two lines that capture an accessor.
     *
     * The rule exists to catch a method torn off its object and called with the
     * wrong `this`. That is precisely the opposite of what happens here: the
     * accessor is captured so it can be re-invoked with the SAME receiver, which
     * the wrapper's explicit `this` parameter and `.call(this)` guarantee.
     * Wrapping an accessor is not expressible any other way.
     */
    const wrapGetter = (target: object, name: string): void => {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      if (descriptor === undefined || typeof descriptor.get !== "function") return;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = descriptor.get;
      Object.defineProperty(target, name, {
        ...descriptor,
        get: function (this: unknown): unknown {
          onRead();
          return original.call(this);
        },
      });
    };

    const wrapSetter = (target: object, name: string): void => {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      if (descriptor === undefined || typeof descriptor.set !== "function") return;
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const original = descriptor.set;
      Object.defineProperty(target, name, {
        ...descriptor,
        set: function (this: unknown, value: unknown): void {
          onWrite();
          original.call(this, value);
        },
      });
    };

    // -- reads: everything that has to know where a box actually is ------------
    wrapMethod(Element.prototype, "getBoundingClientRect", onRead);
    wrapMethod(Element.prototype, "getClientRects", onRead);
    for (const name of [
      "scrollTop",
      "scrollLeft",
      "scrollWidth",
      "scrollHeight",
      "clientTop",
      "clientLeft",
      "clientWidth",
      "clientHeight",
    ]) {
      wrapGetter(Element.prototype, name);
    }
    for (const name of ["offsetTop", "offsetLeft", "offsetWidth", "offsetHeight", "offsetParent"]) {
      wrapGetter(HTMLElement.prototype, name);
    }

    const computed = window.getComputedStyle.bind(window);
    window.getComputedStyle = (...args: [Element, (string | null)?]) => {
      onRead();
      return computed(...args);
    };

    // -- writes: everything that can invalidate one ----------------------------
    for (const name of [
      "setAttribute",
      "removeAttribute",
      "toggleAttribute",
      "insertAdjacentHTML",
      "insertAdjacentElement",
      "append",
      "prepend",
      "before",
      "after",
      "remove",
      "replaceWith",
      "replaceChildren",
    ]) {
      wrapMethod(Element.prototype, name, onWrite);
    }
    for (const name of ["appendChild", "insertBefore", "removeChild", "replaceChild"]) {
      wrapMethod(Node.prototype, name, onWrite);
    }
    for (const name of ["add", "remove", "toggle", "replace"]) {
      wrapMethod(DOMTokenList.prototype, name, onWrite);
    }
    for (const name of ["setProperty", "removeProperty"]) {
      wrapMethod(CSSStyleDeclaration.prototype, name, onWrite);
    }
    wrapSetter(Element.prototype, "className");
    wrapSetter(Element.prototype, "innerHTML");
    wrapSetter(Node.prototype, "textContent");
    wrapSetter(CharacterData.prototype, "data");

    // `cssText` and `cssFloat` are genuinely on the prototype. The other ~600
    // are not — see below.
    for (const name of Object.getOwnPropertyNames(CSSStyleDeclaration.prototype)) {
      wrapSetter(CSSStyleDeclaration.prototype, name);
    }

    /**
     * `el.style.width = "10px"` is the commonest write of all, and it does NOT
     * go through the prototype.
     *
     * This started as a loop over `CSSStyleDeclaration.prototype`, which reads
     * like the obvious answer and wraps nothing: in Blink that prototype has
     * exactly ten own properties — `cssText`, `length`, `parentRule`,
     * `cssFloat` and the six methods. Every CSS property accessor is an own
     * property of the individual declaration object, so `width`, `transform`
     * and `minHeight` were invisible and a drag that writes a transform on
     * every pointer move recorded ZERO writes. The probe reported no forced
     * layouts because it could not see half of the definition.
     *
     * It was caught by the assertion that the gesture had written something at
     * all, which is the only reason it is not still in here reporting zeroes.
     *
     * A Proxy on the declaration is what catches every property without
     * enumerating any, and `el.style` returns the same object each time, so one
     * per element is cached and the cost is O(1). The `get` trap binds platform
     * methods back to the real declaration: `setProperty` called with a Proxy
     * as its receiver throws "Illegal invocation".
     */
    const styleDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "style");
    if (styleDescriptor !== undefined && typeof styleDescriptor.get === "function") {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const readStyle = styleDescriptor.get;
      const proxies = new WeakMap<object, object>();
      Object.defineProperty(HTMLElement.prototype, "style", {
        ...styleDescriptor,
        get: function (this: unknown): unknown {
          const declaration = readStyle.call(this) as object;
          let proxy = proxies.get(declaration);
          if (proxy === undefined) {
            proxy = new Proxy(declaration, {
              get(target, property): unknown {
                const value = Reflect.get(target, property, target) as unknown;
                return typeof value === "function"
                  ? (value as (...args: unknown[]) => unknown).bind(target)
                  : value;
              },
              set(target, property, value): boolean {
                onWrite();
                return Reflect.set(target, property, value, target);
              },
            });
            proxies.set(declaration, proxy);
          }
          return proxy;
        },
      });
    }

    /**
     * Clean again once a frame has actually been painted.
     *
     * A write with no read after it is not a forced layout — the browser lays
     * out at the end of the frame on its own. rAF runs BEFORE that layout, so
     * the flag is cleared from a message posted out of rAF, which lands after
     * paint. Same technique as apps/web/lib/after-paint.ts, for the same reason:
     * rAF is the wrong side of the boundary.
     */
    const settle = (): void => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (): void => {
        dirty = false;
        requestAnimationFrame(settle);
      };
      channel.port2.postMessage(0);
    };
    requestAnimationFrame(settle);
  });
}

/**
 * Throws rather than returning a sentinel when the probe is missing.
 *
 * No probe reads as zero forced layouts, and zero passes a budget of 0 — the
 * exact shape of a test that measures nothing and reports success.
 */
export async function readLayoutProbe(page: Page): Promise<LayoutReading> {
  const reading = await page.evaluate(() => {
    const probe = (window as unknown as { __layout?: LayoutReading }).__layout;
    if (probe === undefined) return null;
    return { forced: probe.forced, reads: probe.reads, writes: probe.writes, where: probe.where };
  });
  if (reading === null) throw new Error("the layout probe is not installed on this page");
  return reading;
}

export async function resetLayoutProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as unknown as { __layout?: LayoutReading }).__layout;
    if (probe === undefined) return;
    probe.forced = 0;
    probe.reads = 0;
    probe.writes = 0;
    probe.where.length = 0;
  });
}
