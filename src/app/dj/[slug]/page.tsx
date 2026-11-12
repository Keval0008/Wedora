import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DjSheet } from "@/components/songs/dj-sheet";
import { djView } from "@/server/routes/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/dj/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const view = await djView(slug);
  const title = view ? `${view.title}${view.coupleNames ? ` · ${view.coupleNames}` : ""} — DJ list` : "DJ list";
  return { title, robots: { index: false, follow: false } };
}

export default async function DjPage({ params }: PageProps<"/dj/[slug]">) {
  const { slug } = await params;
  const view = await djView(slug);
  if (!view) notFound();
  return <DjSheet view={view} />;
}
