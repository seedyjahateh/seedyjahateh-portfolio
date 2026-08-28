/**
 * Verify the taxonomy: file validity, alias uniqueness, closed-enum
 * exhaustiveness in both directions, and track integrity.
 *
 * Run by `pnpm taxonomy:verify` and by the `contracts` CI job.
 */

import {
  checkClosedEnumExhaustiveness,
  loadTaxonomy,
  loadTracks,
  trackByPrefix,
} from "../index.js";

function main(): void {
  const problems: string[] = [];

  const taxonomy = loadTaxonomy();
  process.stdout.write(
    `loaded ${taxonomy.groups.length} vocabulary groups, ${taxonomy.allTerms.size} terms\n`,
  );

  for (const problem of checkClosedEnumExhaustiveness(taxonomy)) {
    problems.push(
      problem.kind === "missing-label"
        ? `${problem.group}: enum member '${problem.value}' has no label. Add it to content/taxonomy/closed-enums.v1.json.`
        : `${problem.group}: label '${problem.value}' has no matching enum member. Remove it, or add the member to packages/contracts/src/enums.ts via a migration.`,
    );
  }

  const tracks = loadTracks(taxonomy);
  if (tracks.length !== 16) {
    problems.push(
      `Expected 16 tracks (portfolio-project-selection.md defines 16 x 15 = 240 projects), found ${tracks.length}.`,
    );
  }

  const prefixes = trackByPrefix(tracks);
  const repositories = new Set<string>();
  for (const track of tracks) {
    if (repositories.has(track.repository)) {
      problems.push(`Repository '${track.repository}' is claimed by more than one track.`);
    }
    repositories.add(track.repository);

    const keystonePrefix = track.keystone.split("-")[0];
    if (keystonePrefix !== track.idPrefix) {
      problems.push(
        `Track '${track.id}' declares keystone '${track.keystone}' but owns prefix '${track.idPrefix}'.`,
      );
    }
    for (const role of track.roles) {
      if (taxonomy.byGroup.get("closed-enums.role")?.has(role) !== true) {
        problems.push(`Track '${track.id}' names unknown role '${role}'.`);
      }
    }
  }
  process.stdout.write(`verified ${tracks.length} tracks, ${prefixes.size} unique id prefixes\n`);

  // Metric units must declare a dimension and a conversion factor, and every
  // dimension a category accepts must be provided by at least one unit
  // (PRD 5.3.1: "Numeric comparison requires compatible units").
  const units = taxonomy.byGroup.get("metrics.units");
  const categories = taxonomy.byGroup.get("metrics.categories");
  const dimensions = new Set<string>();
  if (units === undefined || categories === undefined) {
    problems.push("metrics.v1.json must define both 'units' and 'categories' groups.");
  } else {
    for (const unit of units.values()) {
      if (!unit.dimension || unit.toBase === null || unit.toBase === undefined) {
        problems.push(`Metric unit '${unit.id}' must declare both dimension and toBase.`);
        continue;
      }
      dimensions.add(unit.dimension);
    }
    for (const category of categories.values()) {
      const accepted = category.dimensions;
      if (!accepted || accepted.length === 0) {
        problems.push(`Metric category '${category.id}' must declare at least one dimension.`);
        continue;
      }
      for (const dimension of accepted) {
        if (!dimensions.has(dimension)) {
          problems.push(
            `Metric category '${category.id}' accepts dimension '${dimension}', but no unit provides it.`,
          );
        }
      }
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`\ntaxonomy verification FAILED with ${problems.length} problem(s):\n`);
    for (const problem of problems) process.stderr.write(`  - ${problem}\n`);
    process.exit(1);
  }

  process.stdout.write("taxonomy OK\n");
}

main();
