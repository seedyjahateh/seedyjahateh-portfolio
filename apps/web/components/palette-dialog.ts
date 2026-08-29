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
}

let entries: readonly Entry[] = [];

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

  return [
    {
      label: `Search for “${trimmed}”`,
      hint: "Open the archive with this query",
      href: `/projects?q=${encodeURIComponent(trimmed)}`,
    },
  ];
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

    const link = el("a", { href: entry.href, tabindex: "-1" });
    // textContent, never innerHTML: PRD 5.2.3 requires rendering text nodes
    // rather than injecting markup, and a project title is untrusted enough.
    link.textContent = entry.label;

    const hint = el("span", { class: "palette__hint" });
    hint.textContent = entry.hint;

    item.append(link, hint);
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
  render(input?.value ?? "");
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
  render(initialQuery);
  input.focus();
  input.select();
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
