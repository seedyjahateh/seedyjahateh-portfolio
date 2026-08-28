import type { Metadata } from "next";

import { RolePage } from "../role-page";
import { roleLensBySlug } from "../../lib/site";

const lens = roleLensBySlug("backend-engineer");

// PRD 10.4: every public route carries a unique title, description and
// canonical URL. A curated single-role lens is one of the few filter-shaped
// URLs the PRD marks indexable rather than noindex.
export const metadata: Metadata = {
  title: "Backend Engineer",
  description: "Backend engineering evidence: concurrency, data correctness, distributed failure, API design, and operations.",
  alternates: { canonical: "/backend-engineer" },
};

export default function Page() {
  if (lens === undefined) {
    throw new Error("Missing role lens definition for backend-engineer");
  }
  return <RolePage lens={lens} />;
}