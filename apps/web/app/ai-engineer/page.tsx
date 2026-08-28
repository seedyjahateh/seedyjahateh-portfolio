import type { Metadata } from "next";

import { RolePage } from "../role-page";
import { roleLensBySlug } from "../../lib/site";

const lens = roleLensBySlug("ai-engineer");

// PRD 10.4: every public route carries a unique title, description and
// canonical URL. A curated single-role lens is one of the few filter-shaped
// URLs the PRD marks indexable rather than noindex.
export const metadata: Metadata = {
  title: "AI Engineer",
  description: "AI engineering evidence: retrieval, evaluation, model serving, agent orchestration, and the cost and safety controls around them.",
  alternates: { canonical: "/ai-engineer" },
};

export default function Page() {
  if (lens === undefined) {
    throw new Error("Missing role lens definition for ai-engineer");
  }
  return <RolePage lens={lens} />;
}