import type { Metadata } from "next";

import { RolePage } from "../role-page";
import { roleLensBySlug } from "../../lib/site";

const lens = roleLensBySlug("full-stack-engineer");

// PRD 10.4: every public route carries a unique title, description and
// canonical URL. A curated single-role lens is one of the few filter-shaped
// URLs the PRD marks indexable rather than noindex.
export const metadata: Metadata = {
  title: "Full Stack Engineer",
  description: "Full-stack evidence: product surfaces with real accessibility, performance, security, and test artifacts behind them.",
  alternates: { canonical: "/full-stack-engineer" },
};

export default function Page() {
  if (lens === undefined) {
    throw new Error("Missing role lens definition for full-stack-engineer");
  }
  return <RolePage lens={lens} />;
}