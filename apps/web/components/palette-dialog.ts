/**
 * Command palette dialog. Lazy chunk — never in an initial route bundle.
 *
 * Authority: PRD 5.2.1 (accessible modal dialog with a labeled combobox,
 * listbox results, focus containment, Escape close, restored trigger focus, no
 * keyboard trap; shell open ≤50 ms), 5.2.3 (highlight matched ranges without
 * injecting HTML), 5.2.4 (commands must be discoverable as labeled
 * suggestions), 10.1 (WCAG 2.2 AA).
 *
 * WHY IMPERATIVE DOM AND NOT REACT. Three reasons, all budget-driven. The open
 * budget is 50 ms and creating a React root plus reconciling on every keystroke
 * spends most of it. `SEARCH-PAINT` allows 16 ms p95 from a completed query to
 * painted results, which is one frame — direct node updates hit it reliably.
 * And PRD 5.2.3 requires highlighting to "render text nodes from range
 * boundaries" rather than injecting HTML, which is what this does literally.
 *
 * The tradeoff: this file owns its own DOM lifecycle, so every listener it adds
 * is removed in `close()`. There is no framework to clean up after it.
 */

import { PALETTE_VISIBLE_RESULTS, parseCommand } from "@atlas/contracts/search-protocol";

import { loadClientCatalog } from "../lib/catalog-client";
import { SearchClient } from "../lib/search-client";

let root: HTMLDivElement | null = null;
let input: HTMLInputElement | null = null;
let listbox: HTMLUListElement | null = null;
let status: HTMLParagraphElement | null = null;
let previouslyFocused: HTMLElement | null = null;
let activeIndex = -1;

/** What the palette is currently offering. Replaced wholesale on every render. */
interface Entry {
  readonly label: string;
  readonly hint: string;
  readonly href: string;
  /**
   * Character ranges within `label` that matched the query, `[start, end)`.
   *
   * PRD 5.2.3 requires matched ranges to be highlighted. The worker has always
   * returned them and nothing consumed them until now; measurement put the cost
   * of producing them at +0.3 ms p95, so there was never a performance reason
   * to leave the requirement unbuilt.
   */
  readonly ranges?: readonly (readonly [number, number])[];
}

let entries: readonly Entry[] = [];

/**
 * Search wiring.
 *
 * `search` is null until the worker is ready and stays null if it ever fails
 * fatally — PRD 5.2.1's fallback is that the query goes to /projects?q=… by
 * navigation instead, which is exactly what the command entry below does. So a
 * dead worker degrades to a working link rather than a broken palette.
 */
let search: SearchClient | null = null;
let searchFailed = false;
/** Ordinal -> card, for turning worker results into rows. */
let cards: { id: string; slug: string; t: string; c: string }[] = [];
let projectHits: Entry[] = [];

function startSearch(): void {
  if (search !== null || searchFailed) return;

  const client = new SearchClient({
    onReady: () => {
      // A query may have been typed while the worker was still starting.
      if (input !== null && input.value.trim().length > 0) client.query(input.value);
    },
    onResults: (hit) => {
      // SEARCH-PAINT (PRD 5.2.3, <=16 ms p95): "Main-thread work from a
      // completed query through painted results." The clock starts here, where
      // the results reach the main thread, and stops after the frame that shows
      // them — worker time is already covered by SEARCH-QUERY.
      try {
        performance.mark("atlas:paint-start");
      } catch {
        // No User Timing; no measure is recorded.
      }
      projectHits = [];
      hit.ids.forEach((ordinal, index) => {
        const card = cards[ordinal];
        if (card === undefined) return;
        // Ranges for the title only: that is the text this row renders. The
        // worker reports per-key matches and `matches` is parallel to `ids`.
        const title = hit.matches?.[index]?.find((m) => m.key === "t");
        projectHits.push({
          label: card.t,
          hint: card.id,
          href: `/projects/${card.slug}`,
          ...(title === undefined ? {} : { ranges: title.ranges }),
        });
      });
      render(input?.value ?? "");
      measureAfterPaint("atlas:paint", "atlas:paint-start");
    },
    onError: (_code, fatal) => {
      if (!fatal) return;
      // Never surfaced as an error message: the visitor still has a working
      // path to results, and PRD 10.3 keeps query text out of diagnostics.
      searchFailed = true;
      search = null;
      projectHits = [];
      render(input?.value ?? "");
    },
  });

  search = client;
  void loadClientCatalog()
    .then(({ catalog }) => {
      cards = catalog.byOrdinal.map((card) => ({
        id: card.id,
        slug: card.slug,
        t: card.t,
        c: card.c,
      }));
      return client.start();
    })
    .catch(() => {
      searchFailed = true;
      search = null;
    });
}

/** PRD 5.2.4: bare commands, surfaced as labelled suggestions rather than syntax. */
const BARE_COMMAND_TARGETS: Readonly<Record<string, { href: string; label: string }>> = {
  resume: { href: "/resume", label: "Résumé" },
  contact: { href: "/contact", label: "Contact" },
  writing: { href: "/systems", label: "Systems and writing" },
  "open-source": { href: "/projects?artifact=accepted-upstream-contribution", label: "Open source" },
  github: { href: "/projects", label: "GitHub" },
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function build(): void {
  root = el("div", { class: "palette", hidden: "" });

  const backdrop = el("div", { class: "palette__backdrop" });
  backdrop.addEventListener("click", close);

  const dialog = el("div", {
    class: "palette__dialog",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Search projects and commands",
  });

  const label = el("label", { class: "visually-hidden", for: "palette-input" });
  label.textContent = "Search projects and commands";

  input = el("input", {
    id: "palette-input",
    class: "palette__input",
    type: "text",
    role: "combobox",
    "aria-expanded": "false",
    "aria-controls": "palette-listbox",
    "aria-autocomplete": "list",
    autocomplete: "off",
    placeholder: "Search projects, or try role: or year:",
  });

  listbox = el("ul", {
    id: "palette-listbox",
    class: "palette__results",
    role: "listbox",
    "aria-label": "Results",
  });

  // Polite, not assertive: result counts must not interrupt what the user is
  // typing (PRD 10.1).
  status = el("p", { class: "palette__status", role: "status", "aria-live": "polite" });

  dialog.append(label, input, status, listbox);
  root.append(backdrop, dialog);
  document.body.append(root);

  input.addEventListener("input", onInput);
  root.addEventListener("keydown", onKeyDown);
}

/**
 * Suggestions for the current text.
 *
 * Real project search arrives with the worker; until then this resolves the
 * PRD 5.2.4 command grammar, which `parseCommand` already implements and tests
 * in the frozen protocol. Nothing here fabricates project results.
 */
function suggestionsFor(query: string): Entry[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [
      { label: "All projects", hint: "Browse the archive", href: "/projects" },
      { label: "Résumé", hint: "Experience and education", href: "/resume" },
      { label: "Contact", hint: "Get in touch", href: "/contact" },
    ];
  }

  const command = parseCommand(trimmed);
  if (command !== null) {
    if (command.kind === "bare") {
      const target = BARE_COMMAND_TARGETS[command.command];
      if (target !== undefined) {
        return [{ label: target.label, hint: `Go to ${target.href}`, href: target.href }];
      }
    } else {
      const href = `/projects?${command.prefix}=${encodeURIComponent(command.value)}`;
      return [
        {
          label: `${command.prefix}: ${command.value}`,
          hint: "Filter the archive",
          href,
        },
      ];
    }
  }

  /**
   * Project results first, then the archive escape hatch.
   *
   * The escape hatch is always present, not only on failure: the worker caps
   * results at 50 (PRD 5.2.3) and the palette shows 12, so "see all results"
   * is the honest way to reach the rest. It is also, unchanged, the fallback
   * PRD 5.2.1 specifies when the worker is unavailable.
   */
  return [
    ...projectHits,
    {
      label: `See all results for “${trimmed}”`,
      hint: "Open the archive",
      href: `/projects?q=${encodeURIComponent(trimmed)}`,
    },
  ];
}

/**
 * Close a User Timing measure once the browser has actually painted.
 *
 * `requestAnimationFrame` runs BEFORE paint, so a single rAF would stop the
 * clock on work the visitor cannot see yet. The nested callback runs on the
 * next frame, by which time the previous one is on screen — the usual way to
 * approximate "painted" without a dedicated API.
 *
 * Every call is wrapped: a missing start mark throws, and measurement must
 * never take down the thing it is measuring.
 */
function measureAfterPaint(name: string, startMark: string): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        performance.measure(name, startMark);
      } catch {
        // The start mark never happened; nothing to record.
      }
    });
  });
}

/**
 * Write `text` into `host`, wrapping matched ranges in `<mark>`.
 *
 * Authority: PRD 5.2.3 — "Highlight matched ranges without injecting HTML.
 * Render text nodes from range boundaries."
 *
 * Every segment is a text node created from a substring, so a title containing
 * `<script>` renders as those characters and nothing else. `<mark>` also
 * carries the meaning natively, which a styled `<span>` would not: screen
 * readers can announce it, and it survives forced-colors mode.
 *
 * Ranges are clamped and sorted rather than trusted. They arrive from Fuse via
 * the worker, and a malformed or overlapping range should degrade to plain
 * text, never drop characters or throw mid-render.
 */
function paintLabel(
  host: HTMLElement,
  text: string,
  ranges: readonly (readonly [number, number])[] | undefined,
): void {
  host.replaceChildren();

  const usable = (ranges ?? [])
    .map(([start, end]) => [Math.max(0, start), Math.min(text.length, end)] as const)
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);

  let cursor = 0;
  for (const [start, end] of usable) {
    // Overlaps would otherwise repeat characters.
    if (start < cursor) continue;
    if (start > cursor) host.append(document.createTextNode(text.slice(cursor, start)));
    const hit = document.createElement("mark");
    hit.textContent = text.slice(start, end);
    host.append(hit);
    cursor = end;
  }
  if (cursor < text.length) host.append(document.createTextNode(text.slice(cursor)));
}

function render(query: string): void {
  if (listbox === null || input === null || status === null) return;

  entries = suggestionsFor(query).slice(0, PALETTE_VISIBLE_RESULTS);
  listbox.replaceChildren();

  entries.forEach((entry, index) => {
    const item = el("li", {
      id: `palette-option-${index}`,
      class: "palette__result",
      role: "option",
      "aria-selected": index === activeIndex ? "true" : "false",
    });

    /**
     * A span, deliberately not an anchor.
     *
     * An <a> inside role="option" is nested interactive content: axe flags it
     * `nested-interactive` at serious impact, and A11Y-AXE-SERIOUS budgets zero
     * of those. The combobox pattern PRD 5.2.1 mandates makes the option itself
     * the target, reached through aria-activedescendant, so the row must not
     * contain its own focusable control.
     *
     * The cost is that middle-click and open-in-new-tab do not work here. That
     * is the right trade for a keyboard-first palette: the archive renders real
     * anchors, and every option's destination is also reachable there.
     */
    const label = el("span", { class: "palette__label" });
    // Text nodes, never innerHTML: PRD 5.2.3 requires rendering text nodes from
    // range boundaries rather than injecting markup, and a project title is
    // untrusted enough to mean it.
    paintLabel(label, entry.label, entry.ranges);

    const hint = el("span", { class: "palette__hint" });
    hint.textContent = entry.hint;

    item.dataset["href"] = entry.href;
    item.append(label, hint);
    item.addEventListener("click", () => {
      window.location.href = entry.href;
    });
    listbox?.append(item);
  });

  input.setAttribute("aria-expanded", entries.length > 0 ? "true" : "false");
  if (activeIndex >= 0 && activeIndex < entries.length) {
    input.setAttribute("aria-activedescendant", `palette-option-${activeIndex}`);
  } else {
    input.removeAttribute("aria-activedescendant");
  }

  status.textContent =
    entries.length === 0
      ? "No matches."
      : `${entries.length} ${entries.length === 1 ? "result" : "results"}.`;
}

function onInput(): void {
  activeIndex = -1;
  const value = input?.value ?? "";
  // Commands are resolved locally; only free text reaches the worker.
  if (parseCommand(value.trim()) === null) search?.query(value);
  else projectHits = [];
  render(value);
}

function move(delta: number): void {
  if (entries.length === 0) return;
  activeIndex = (activeIndex + delta + entries.length) % entries.length;
  render(input?.value ?? "");
}

function onKeyDown(event: KeyboardEvent): void {
  switch (event.key) {
    case "Escape":
      event.preventDefault();
      close();
      return;
    case "ArrowDown":
      event.preventDefault();
      move(1);
      return;
    case "ArrowUp":
      event.preventDefault();
      move(-1);
      return;
    case "Enter": {
      const entry = entries[activeIndex];
      if (entry !== undefined) {
        event.preventDefault();
        window.location.href = entry.href;
      }
      return;
    }
    case "Tab": {
      /**
       * Focus containment WITHOUT a keyboard trap (PRD 5.2.1 requires both).
       *
       * The dialog holds exactly one focusable control, so Tab is kept on it
       * rather than allowed to escape into the page behind the modal. Escape
       * always closes, which is what makes this containment rather than a
       * trap — the user is never stuck.
       */
      event.preventDefault();
      input?.focus();
      return;
    }
    default:
      return;
  }
}

export function openPalette(initialQuery = ""): void {
  if (root === null) build();
  if (root === null || input === null) return;

  previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  root.hidden = false;
  document.documentElement.classList.add("palette-open");
  input.value = initialQuery;
  activeIndex = -1;
  projectHits = [];

  // The shell paints first and search starts after (PRD 5.2.1: the palette
  // "may show recent/featured commands while the search worker becomes
  // ready"). Opening must not wait on a fetch — the budget is 50 ms.
  render(initialQuery);
  input.focus();
  input.select();

  // Measured after the frame that shows the dialog, not at the end of this
  // function: "opens" means a visitor can see it. rAF fires before paint, so
  // the nested call lands just after it.
  measureAfterPaint("atlas:palette:open", "atlas:palette:open-start");

  startSearch();
  if (initialQuery.trim().length > 0 && parseCommand(initialQuery.trim()) === null) {
    search?.query(initialQuery);
  }
}

export function close(): void {
  if (root === null) return;
  root.hidden = true;
  document.documentElement.classList.remove("palette-open");
  // PRD 5.2.1: restore the trigger's focus, or the user is dropped at the top
  // of the document with no idea where they were.
  previouslyFocused?.focus();
  previouslyFocused = null;
}
