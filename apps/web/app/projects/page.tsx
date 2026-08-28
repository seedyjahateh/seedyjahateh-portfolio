import type { Metadata } from "next";

import { ProjectsIndex } from "./projects-index";

export const metadata: Metadata = {
  title: "Project atlas",
  description:
    "Every published project, with its proof level, status, and role relevance. Paginated and readable without JavaScript.",
  alternates: { canonical: "/projects" },
};

export default function Page() {
  return <ProjectsIndex page={1} />;
}