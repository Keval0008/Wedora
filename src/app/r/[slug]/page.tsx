import { MapPin, Shirt } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatClock, formatDateKey } from "@/lib/format";
import { runSheetView } from "@/server/routes/public";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/r/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const view = await runSheetView(slug);
  const title = view?.coupleNames ? `${view.coupleNames} — wedding schedule` : "Wedding schedule";
  return { title, description: "Timings, venues and maps for every function.", robots: { index: false, follow: false } };
}

/** The read-only schedule shared in the family WhatsApp group. */
export default async function RunSheetPage({ params }: PageProps<"/r/[slug]">) {
  const { slug } = await params;
  const view = await runSheetView(slug);
  if (!view) notFound();

  return (
    <div className="min-h-dvh">
      <div className="toran" aria-hidden />
      <div className="mx-auto w-full max-w-xl px-4 pb-16 pt-8">
        <header className="text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-marigold">Shubh Vivah</p>
          <h1 className="mt-2 font-display text-5xl font-semibold leading-[1.02] tracking-tight">{view.coupleNames ?? "Our wedding"}</h1>
          {view.weddingDate && <p className="mt-2 font-display text-xl italic text-ink-soft">{formatDateKey(view.weddingDate, true)}</p>}
          <div className="flourish mx-auto mt-3 max-w-[14rem]" aria-hidden>
            ✿
          </div>
        </header>

        <div className="mt-8 space-y-5">
          {view.functions.map((f) => (
            <section key={f.id} className="overflow-hidden rounded-[14px] border border-rule-strong bg-raised" style={{ boxShadow: `inset 4px 0 0 ${f.color}` }}>
              <div className="p-4">
                <h2 className="font-display text-3xl font-semibold leading-tight">{f.name}</h2>
                <p className="text-[14px] text-ink-soft">
                  {f.date ? formatDateKey(f.date) : ""}
                  {f.startTime ? ` · ${formatClock(f.startTime)}` : ""}
                </p>
                {f.venue && (
                  <p className="mt-1 flex items-center gap-1.5 text-[14px]">
                    <MapPin className="size-4 text-signal" />
                    {f.mapUrl ? (
                      <a href={f.mapUrl} className="font-medium text-signal underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                        {f.venue} — open map
                      </a>
                    ) : (
                      f.venue
                    )}
                  </p>
                )}
                {f.dressCode && (
                  <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ink-soft">
                    <Shirt className="size-4 text-marigold" /> {f.dressCode}
                  </p>
                )}
                {f.notes && <p className="mt-2 whitespace-pre-line text-[13px] text-ink-muted">{f.notes}</p>}
              </div>
              {f.items.length > 0 && (
                <ol className="border-t border-rule px-4 py-3">
                  {f.items.map((i) => (
                    <li key={i.id} className="flex gap-3 py-1 text-[14px]">
                      <span className="w-16 shrink-0 font-mono text-[12px] text-ink-muted">{formatClock(i.time)}</span>
                      <span className="min-w-0 flex-1">
                        {i.title}
                        {i.owner && <span className="text-ink-muted"> · {i.owner}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
