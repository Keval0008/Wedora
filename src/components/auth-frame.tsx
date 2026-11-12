"use client";

/**
 * Split layout for the signed-out pages: an editorial panel on the left at
 * desktop widths, collapsing to a compact header on phones.
 */
export function AuthFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="relative flex flex-col justify-between overflow-hidden border-b border-rule bg-sunken px-5 py-6 lg:w-[42%] lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
        <div aria-hidden className="toran absolute inset-x-0 top-0" />
        {/* A rangoli-like wheel: the one piece of pure decoration in the app. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 size-[28rem] rounded-full opacity-[0.10]"
          style={{
            background:
              "repeating-conic-gradient(from 0deg, var(--marigold) 0deg 6deg, transparent 6deg 12deg), radial-gradient(circle, var(--signal) 0 18%, transparent 19% 30%, var(--marigold) 31% 33%, transparent 34%)",
          }}
        />
        <p className="pt-3 font-display text-4xl font-semibold leading-none tracking-tight lg:text-5xl">
          Wed<span className="italic text-signal">ora</span>
        </p>

        <div className="hidden lg:block">
          <p className="max-w-sm font-display text-5xl leading-[1.02] tracking-tight text-ink">
            The whole <span className="italic text-signal">shaadi</span>,
            <br />
            on one phone.
          </p>
          <ul className="mt-8 space-y-2 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-muted">
            <li>— To-dos with a reminder at the right time</li>
            <li>— Baraat &amp; sangeet songs from friends</li>
            <li>— Vendors, payments, chandla</li>
          </ul>
        </div>

        <p className="hidden font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted lg:block">
          Made for the family, not the planner
        </p>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-8 lg:px-10">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight lg:text-5xl">{title}</h1>
          {subtitle && <p className="mt-2 mb-6 text-sm text-ink-muted">{subtitle}</p>}
          {children}
          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
