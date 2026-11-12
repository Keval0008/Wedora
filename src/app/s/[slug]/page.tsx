import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSongForm } from "@/components/songs/public-song-form";
import { publicListView } from "@/server/routes/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const view = await publicListView(slug);
  if (!view) return { title: "Song list" };
  const what = view.kind === "sangeet" ? "Add your sangeet performance" : "Suggest baraat songs";
  const title = view.coupleNames ? `${what} · ${view.coupleNames}` : what;
  return {
    title,
    description: "Paste a Spotify or YouTube Music link — duplicates are merged automatically.",
    openGraph: { title, description: "Paste a Spotify or YouTube Music link. Takes ten seconds.", type: "website" },
    robots: { index: false, follow: false },
  };
}

export default async function GuestSongPage({ params }: PageProps<"/s/[slug]">) {
  const { slug } = await params;
  const view = await publicListView(slug);
  if (!view) notFound();
  return <PublicSongForm slug={slug} initial={view} />;
}
