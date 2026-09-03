import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WindowFrame } from "../../../../components/window-frame";
import { ProjectsIndex } from "../../projects-index";
import { totalIndexPages } from "../../../../lib/content";

/**
 * Pages 2..N of the paginated index.
 *
 * Page 1 lives at /projects, not /projects/page/1, so there is exactly one URL
 * per document — PRD 0.3 treats duplicate URLs for one document as a defect.
 */
export function generateStaticParams(): { n: string }[] {
  const pages = totalIndexPages();
  return Array.from({ length: Math.max(0, pages - 1) }, (_, i) => ({ n: String(i + 2) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  return {
    title: `Project atlas — page ${n}`,
    alternates: { canonical: `/projects/page/${n}` },
  };
}

export default async function Page({ params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const page = Number(n);
  if (!Number.isInteger(page) || page < 2 || page > totalIndexPages()) notFound();
  // The heading is owned by the route rather than by ProjectsIndex; see the
  // note in projects-index.tsx for why.
  return (
    <WindowFrame id="atlas-page" title="Project atlas" titleAs="span">
      <h1>Project atlas</h1>
      <ProjectsIndex page={page} />
    </WindowFrame>
  );
}