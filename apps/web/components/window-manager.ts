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
 * to `CLS` and forces no layout. The single place this file reads layout is
 * `relayout`, which runs on load and on resize — never on pointermove, and never
 * on scroll.
 */

/** Gap between a window and the surface edge, and between windows. */
const GUTTER = 24;

/** How much of a window must stay on the surface. Losing one is unrecoverable. */
const MIN_VISIBLE = 140;

/** Arrow-key step, and the coarse step with Shift held. */
const NUDGE = 16;
const NUDGE_FAR = 64;

/** Below this the surface is a single column and `half` spans are ignored. */
const TWO_COLUMN_MIN = 900;

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

  /** Keep enough of a window on the surface that it can always be grabbed back. */
  function clamp(w: Placed): void {
    const limit = surface.clientWidth;
    w.x = Math.min(Math.max(w.x, MIN_VISIBLE - w.w), limit - MIN_VISIBLE);
    w.y = Math.max(w.y, 0);
  }

  function relayout(): void {
    const available = surface.clientWidth - GUTTER * 2;
    if (available <= 0) return;
    const half = Math.floor((available - GUTTER) / 2);
    const twoColumn = surface.clientWidth >= TWO_COLUMN_MIN;

    let cursor = GUTTER;
    let pending: Placed | null = null;
    let pendingHeight = 0;

    for (const w of windows) {
      if (w.placed) {
        // Re-clamp rather than re-place: a viewport narrower than last time can
        // otherwise leave a moved window off the right-hand edge.
        w.w = Math.min(w.w, available);
        clamp(w);
        write(w);
        continue;
      }

      const wantsHalf = w.node.dataset["windowSpan"] === "half" && twoColumn;
      if (wantsHalf) {
        if (pending === null) {
          w.x = GUTTER;
          w.y = cursor;
          w.w = half;
          write(w);
          pending = w;
          pendingHeight = w.node.offsetHeight;
        } else {
          w.x = GUTTER + half + GUTTER;
          w.y = cursor;
          w.w = half;
          write(w);
          cursor += Math.max(pendingHeight, w.node.offsetHeight) + GUTTER;
          pending = null;
        }
        continue;
      }

      if (pending !== null) {
        cursor += pendingHeight + GUTTER;
        pending = null;
      }
      w.x = GUTTER;
      w.y = cursor;
      w.w = available;
      write(w);
      cursor += w.node.offsetHeight + GUTTER;
    }

    if (pending !== null) cursor += pendingHeight + GUTTER;

    // The surface holds nothing in flow, so its height has to be stated. Placed
    // windows count too, or a dragged-down window would be unreachable.
    let bottom = cursor;
    for (const w of windows) bottom = Math.max(bottom, w.y + w.node.offsetHeight + GUTTER);
    surface.style.minHeight = `${bottom}px`;
  }

  function clear(): void {
    for (const w of windows) {
      w.node.style.removeProperty("width");
      w.node.style.removeProperty("transform");
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
    const available = surface.clientWidth - GUTTER * 2;
    const half = Math.floor((available - GUTTER) / 2);

    if (where === "reset") {
      w.placed = false;
      w.state = "normal";
      applyState(w);
      relayout();
      writeSaved(windows);
      return;
    }

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
      w.x = Math.round((surface.clientWidth - w.w) / 2);
      w.y = GUTTER;
    } else if (where === "fill") {
      w.x = GUTTER;
      w.y = GUTTER;
      w.w = available;
    } else {
      return;
    }

    w.placed = true;
    clamp(w);
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

    dragging = w;
    handle = bar;
    originX = event.clientX;
    originY = event.clientY;
    startX = w.x;
    startY = w.y;
    w.node.dataset["dragging"] = "";
    bar.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event: PointerEvent): void {
    if (dragging === null) return;
    dragging.x = startX + (event.clientX - originX);
    dragging.y = startY + (event.clientY - originY);
    clamp(dragging);
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
    w.placed = true;
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

    const distance = event.shiftKey ? NUDGE_FAR : NUDGE;
    w.x += step[0] * distance;
    w.y += step[1] * distance;
    w.placed = true;
    clamp(w);
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
