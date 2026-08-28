/**
 * @atlas/contracts - frozen Phase 0 contracts.
 *
 * Architect-owned. Workstreams A-F list this package under `readOnlyPaths` in their
 * task packets (PRD 12.3); changing anything here requires an ADR and a
 * migration, not a pull request against a downstream workstream.
 */

export * from "./enums.js";
export * from "./canonical-json.js";
export * from "./project.js";
export * from "./url-state.js";
export * from "./search-protocol.js";
export * from "./artifacts.js";
export * from "./rules/registry.js";
