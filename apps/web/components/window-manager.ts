/**
 * Window geometry and interaction.
 *
 * Authority: ADR 0036, PRD 10.1 (WCAG 2.2 AA), 9.1 (`INP` 150 ms, `CLS` 0.05),
 * 9.3 (no per-item listeners, `FORCED-LAYOUTS-SCROLL` 0).
 *
 * THE MENU IS THE MECHANISM; THE DRAG IS THE ENHANCEMENT. WCAG 2.2 SC 2.5.7
 * requires a single-pointer equivalent for anything operated by dragging, and
 * the "essential" exemption does not apply because a window's position can
 * plainly be set another way. So the placement actions below are the real
 * interface and `startDrag` is a shortcut for people who can use one. Reading
 * this file in the other order gets the requirement backwards.
 *
 * THREE LISTENERS, WHATEVER THE WINDOW COUNT. Everything is delegated from the
 * surface and resolved with `closest()`. PRD 9.3 forbids a listener per item,
 * and `tests/e2e/desktop.spec.ts` counts them rather than trusting this comment.
 *
 * GEOMETRY IS A TRANSFORM, NEVER A LAYOUT PROPERTY. Windows are absolutely
 * positioned and moved with `translate3d`, so dragging one contributes nothing
 * to `CLS`.
 *
 * NO LAYOUT IS READ DURING A DRAG, and that sentence used to be here as a claim
 * rather than a fact. `onPointerMove` called `clamp`, and `clamp` read
 * `surface.clientWidth` — after the previous move had already written a
 * transform, which makes it a forced synchronous layout on the one code path
 * where a dropped frame shows up as the window lagging the cursor. PRD 9.3
 * forbids exactly this interleaving. The surface width is captured once at
 * pointerdown now, because it cannot change while a pointer is captured, and
 * `clamp` is given a number instead of going to find one.
 *
 * `tests/e2e/desktop.spec.ts` counts forced layouts across a drag rather than
 * trusting this paragraph, which is how the original claim was found to be
 * false in the first place.
 */

/** Gap between a window and the surface edge, and between windows. */
const GUTTER = 24;

/** How much of a window must stay on the surface. Losing one is unrecoverable. */
const MIN_VISIBLE = 140;

/** Arrow-key step, and the coarse step with Shift held. */
const NUDGE = 16;
const NUDGE_FAR = 64;

type WindowState = "normal" | "minimized" | "zoomed";

interface Placed {
  readonly node: HTMLElement;
  readonly id: string;
  x: number;
  y: number;
  w: number;
  /** True once a person has positioned it. Automatic layout then leaves it be. */
  placed: boolean;
  state: WindowState;
}

interface Saved {
  x: number;
  y: number;
  w: number;
  state: WindowState;
}

export interface WindowManager {
  relayout: () => void;
  clear: () => void;
  destroy: () => void;
}

/**
 * Saved geometry, per route.
 *
 * The first client-side storage in this repository, so it sets the pattern
 * rather than following one. It follows `url-state.ts` in the way that matters:
 * total, never throws, and drops anything it does not recognise instead of
 * trusting it. Storage can also throw outright — Safari in private mode — so
 * every access is wrapped and failure means "no saved geometry", never an error.
 *
 * `sessionStorage`, not `localStorage`: an arrangement is worth keeping across
 * the full page loads that navigation causes here, but a window someone moved
 * once should not still be there in a fortnight.
 */
function storageKey(): string {
  return `atlas:windows:v1:${window.location.pathname}`;
}

function readSaved(): Record<string, Saved> {
  try {
    const raw = window.sessionStorage.getItem(storageKey());
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, Saved> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "object" || value === null) continue;
      const v = value as Record<string, unknown>;
      if (typeof v["x"] !== "number" || typeof v["y"] !== "number" || typeof v["w"] !== "number") {
        continue;
      }
      if (!Number.isFinite(v["x"]) || !Number.isFinite(v["y"]) || !Number.isFinite(v["w"])) continue;
      const state = v["state"];
      out[id] = {
        x: v["x"],
        y: v["y"],
        w: v["w"],
        state: state === "minimized" || state === "zoomed" ? state : "normal",
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeSaved(windows: readonly Placed[]): void {
  try {
    const payload: Record<string, Saved> = {};
    for (const w of windows) {
      if (!w.placed && w.state === "normal") continue;
      payload[w.id] = { x: w.x, y: w.y, w: w.w, state: w.state };
    }
    window.sessionStorage.setItem(storageKey(), JSON.stringify(payload));
  } catch {
    // Storage unavailable or full. The arrangement simply does not persist.
  }
}

export function createWindowManager(surface: HTMLElement): WindowManager {
  const nodes = [...surface.querySelectorAll<HTMLElement>(".window")];
  const saved = readSaved();

  const windows: Placed[] = nodes.map((node, index) => {
    const id = node.dataset["window"] ?? `window-${index}`;
    const restore = saved[id];
    return {
      node,
      id,
      x: restore?.x ?? 0,
      y: restore?.y ?? 0,
      w: restore?.w ?? 0,
      placed: restore !== undefined,
      state: restore?.state ?? "normal",
    };
  });

  const byNode = new Map(windows.map((w) => [w.node, w]));
  let topZ = windows.length;

  /* ---------------------------------------------------------------- geometry */

  function write(w: Placed): void {
    w.node.style.width = `${w.w}px`;
    w.node.style.transform = `translate3d(${w.x}px, ${w.y}px, 0)`;
  }

  /**
   * Keep enough of a window on the surface that it can always be grabbed back.
   *
   * `limit` is passed in rather than read here. This used to read
   * `surface.clientWidth` itself, which made every caller a layout read —
   * including `onPointerMove`, where the previous move had just written a
   * transform, so each pointer event forced a synchronous layout.
   */
  function clamp(w: Placed, limit: number): void {
    w.x = Math.min(Math.max(w.x, MIN_VISIBLE - w.w), limit - MIN_VISIBLE);
    w.y = Math.max(w.y, 0);
  }

  /** A window returns to the grid: no inline geometry, no absolute positioning. */
  function unplace(w: Placed): void {
    w.placed = false;
    delete w.node.dataset["windowPlaced"];
    w.node.style.removeProperty("width");
    w.node.style.removeProperty("transform");
  }

  /**
   * Only placed windows are positioned here.
   *
   * This function used to lay out every window on load, which is what put 0.46
   * of cumulative layout shift on the page against a 0.05 budget: the document
   * painted in flow and then four windows jumped out of it. The grid in
   * globals.css does that arrangement now, with no script and no movement, and
   * this is left with the job it should always have had — keeping windows a
   * person has moved somewhere reachable.
   */
  function relayout(): void {
    const width = surface.clientWidth;
    const available = width - GUTTER * 2;
    if (available <= 0) return;

    const placed = windows.filter((w) => w.placed);

    // Every write first. Interleaved with the height reads below, this was one
    // forced synchronous layout per placed window.
    for (const w of placed) {
      // Re-clamp rather than re-place: a viewport narrower than last time can
      // otherwise leave a moved window off the right-hand edge.
      w.w = Math.min(w.w, available);
      clamp(w, width);
      write(w);
    }

    // Then every read. The first one flushes the layout all of those writes
    // invalidated; the rest cost nothing.
    let bottom = 0;
    for (const w of placed) {
      bottom = Math.max(bottom, w.y + w.node.offsetHeight + GUTTER);
    }

    // A placed window is out of flow, so the grid's own height does not account
    // for it. Without this, dragging one downwards makes it unreachable.
    //
    // Compared before writing: `relayout` runs on load and on every resize
    // frame, and an unconditional write marks the document dirty each time, so
    // the next read anywhere on the page is forced by a style that did not
    // change.
    const next = bottom > 0 ? `${bottom}px` : "";
    if (surface.style.minHeight !== next) {
      if (next === "") surface.style.removeProperty("min-height");
      else surface.style.minHeight = next;
    }
  }

  /**
   * Take a window out of the grid at exactly the position it already occupies.
   *
   * Called the moment a drag or a placement begins. Reading the geometry first
   * and writing it straight back is what stops the window jumping to the corner
   * on the first pixel of movement.
   */
  function lift(w: Placed): void {
    if (w.placed) return;
    const box = w.node.getBoundingClientRect();
    const host = surface.getBoundingClientRect();
    w.w = Math.round(box.width);
    w.x = Math.round(box.left - host.left);
    w.y = Math.round(box.top - host.top);
    w.placed = true;

    /**
     * The lift itself must not animate.
     *
     * Going absolute gives the window `left: 0` and it has no inline transform
     * yet, so the snap transition would animate it from the surface's corner to
     * where it already was — a visible lurch before every placement, and enough
     * to make a test reading the box mid-flight see x = 0 for a window that
     * ends at 724.
     *
     * Suppress, write, force a style flush, restore. The next transform change
     * then transitions from the right starting point.
     */
    w.node.style.transition = "none";
    w.node.dataset["windowPlaced"] = "";
    write(w);
    void w.node.offsetHeight;
    w.node.style.removeProperty("transition");
  }

  function clear(): void {
    for (const w of windows) {
      unplace(w);
      w.node.style.removeProperty("z-index");
    }
    surface.style.removeProperty("min-height");
  }

  /* ------------------------------------------------------------------ actions */

  function raise(w: Placed): void {
    topZ += 1;
    // Bounded on purpose: the menu bar sits at z-index 30 and a window must
    // never climb over it. Renumbering from the bottom keeps the stack small
    // however long someone plays with it.
    if (topZ > 20) {
      const order = [...windows].sort(
        (a, b) => Number(a.node.style.zIndex || 0) - Number(b.node.style.zIndex || 0),
      );
      order.forEach((item, index) => (item.node.style.zIndex = String(index + 1)));
      topZ = order.length + 1;
    }
    w.node.style.zIndex = String(topZ);
  }

  function place(w: Placed, where: string): void {
    // Read before `lift`, which writes. Read after it, this is a forced layout
    // on every menu selection.
    const width = surface.clientWidth;
    const available = width - GUTTER * 2;
    const half = Math.floor((available - GUTTER) / 2);

    if (where === "reset") {
      unplace(w);
      w.state = "normal";
      applyState(w);
      relayout();
      writeSaved(windows);
      return;
    }

    // Out of the grid first, so `place` only ever writes to a positioned window.
    lift(w);

    if (where === "left") {
      w.x = GUTTER;
      w.y = GUTTER;
      w.w = half;
    } else if (where === "right") {
      w.x = GUTTER + half + GUTTER;
      w.y = GUTTER;
      w.w = half;
    } else if (where === "centre") {
      w.w = Math.min(available, 960);
      w.x = Math.round((width - w.w) / 2);
      w.y = GUTTER;
    } else if (where === "fill") {
      w.x = GUTTER;
      w.y = GUTTER;
      w.w = available;
    } else {
      return;
    }

    // `lift` above already marked it placed.
    clamp(w, width);
    write(w);
    raise(w);
    relayout();
    writeSaved(windows);
  }

  function applyState(w: Placed): void {
    const minimized = w.state === "minimized";
    if (w.state === "normal") delete w.node.dataset["windowState"];
    else w.node.dataset["windowState"] = w.state;

    w.node
      .querySelector("[data-window-action='minimize']")
      ?.setAttribute("aria-expanded", minimized ? "false" : "true");
    w.node
      .querySelector("[data-window-action='zoom']")
      ?.setAttribute("aria-pressed", w.state === "zoomed" ? "true" : "false");
  }

  function toggleMinimize(w: Placed): void {
    w.state = w.state === "minimized" ? "normal" : "minimized";
    applyState(w);
    relayout();
    writeSaved(windows);
  }

  function toggleZoom(w: Placed): void {
    if (w.state === "zoomed") {
      w.state = "normal";
      applyState(w);
      place(w, "reset");
      return;
    }
    w.state = "zoomed";
    applyState(w);
    place(w, "fill");
  }

  /* --------------------------------------------------------------------- drag */

  let dragging: Placed | null = null;
  let originX = 0;
  let originY = 0;
  let startX = 0;
  let startY = 0;
  let handle: HTMLElement | null = null;
  /** The surface width, captured at pointerdown. See `clamp`. */
  let dragLimit = 0;

  function onPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const node = target.closest<HTMLElement>(".window");
    const w = node === null ? undefined : byNode.get(node);
    if (w === undefined) return;

    // Any interaction raises, including a click in the body. This is separate
    // from dragging and happens even when the gesture starts on a control.
    raise(w);

    const bar = target.closest<HTMLElement>("[data-window-handle]");
    if (bar === null) return;
    // The controls live in the bar and must stay clickable.
    if (target.closest("button, summary, a, input, select, textarea") !== null) return;
    if (event.button !== 0) return;

    // Out of the grid at exactly where it already is. Without this the first
    // pixel of movement would snap the window to the surface's corner, because
    // an unplaced window has no coordinates of its own yet.
    lift(w);

    dragging = w;
    handle = bar;
    originX = event.clientX;
    originY = event.clientY;
    startX = w.x;
    startY = w.y;
    // Read once, here, where nothing has been written since the last frame.
    // The pointer is captured for the whole gesture, so this cannot go stale;
    // a resize mid-drag is re-clamped by `relayout` on release.
    dragLimit = surface.clientWidth;
    w.node.dataset["dragging"] = "";
    bar.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (dragging === null) return;
    dragging.x = startX + (event.clientX - originX);
    dragging.y = startY + (event.clientY - originY);
    clamp(dragging, dragLimit);
    write(dragging);
  }

  function endDrag(event: PointerEvent): void {
    if (dragging === null) return;
    const w = dragging;
    const bar = handle;
    dragging = null;
    handle = null;
    if (bar?.hasPointerCapture(event.pointerId) === true) {
      bar.releasePointerCapture(event.pointerId);
    }
    delete w.node.dataset["dragging"];
    // `lift` on pointerdown already marked it placed.
    relayout();
    writeSaved(windows);
  }

  /* ------------------------------------------------------------------- events */

  function onClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const control = target.closest<HTMLElement>("[data-window-action], [data-window-place]");
    if (control === null) return;
    const node = control.closest<HTMLElement>(".window");
    const w = node === null ? undefined : byNode.get(node);
    if (w === undefined) return;

    const action = control.dataset["windowAction"];
    if (action === "minimize") {
      toggleMinimize(w);
      return;
    }
    if (action === "zoom") {
      toggleZoom(w);
      return;
    }

    const where = control.dataset["windowPlace"];
    if (where !== undefined) {
      place(w, where);
      // Close the menu the way a menu closes after a choice. `<details>` owns
      // its own open state, so this is the one place we touch it.
      control.closest("details")?.removeAttribute("open");
    }
  }

  const ARROWS: Record<string, readonly [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  function onKeyDown(event: KeyboardEvent): void {
    const step = ARROWS[event.key];
    if (step === undefined) return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    /**
     * Arrows move a window only while focus is inside its title bar. Nothing in
     * there uses arrow keys — buttons and `<summary>` do not — so they are free
     * to take, and no modifier is needed. This is the keyboard half of SC 2.5.7;
     * the menu is the single-pointer half and does the same job discretely.
     */
    if (target.closest("[data-window-handle]") === null) return;
    const node = target.closest<HTMLElement>(".window");
    const w = node === null ? undefined : byNode.get(node);
    if (w === undefined) return;

    // Before `lift`, which writes. `lift` also flushes layout deliberately, so
    // reading after it would be a second forced layout per keypress.
    const width = surface.clientWidth;

    // Same reason as the drag: nudging a window still in the grid would move it
    // from coordinates it does not have yet.
    lift(w);

    const distance = event.shiftKey ? NUDGE_FAR : NUDGE;
    w.x += step[0] * distance;
    w.y += step[1] * distance;
    clamp(w, width);
    write(w);
    raise(w);
    event.preventDefault();
    relayout();
    writeSaved(windows);
  }

  surface.addEventListener("pointerdown", onPointerDown);
  surface.addEventListener("pointermove", onPointerMove);
  surface.addEventListener("pointerup", endDrag);
  surface.addEventListener("pointercancel", endDrag);
  surface.addEventListener("click", onClick);
  surface.addEventListener("keydown", onKeyDown);

  for (const w of windows) {
    applyState(w);
    w.node.style.zIndex = String(windows.indexOf(w) + 1);
    // Restored from a previous visit: the attribute is what takes it out of the
    // grid, so it has to be set before the geometry means anything.
    if (w.placed) {
      w.node.dataset["windowPlaced"] = "";
      write(w);
    }
  }

  return {
    relayout,
    clear,
    destroy() {
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", endDrag);
      surface.removeEventListener("pointercancel", endDrag);
      surface.removeEventListener("click", onClick);
      surface.removeEventListener("keydown", onKeyDown);
      clear();
    },
  };
}
