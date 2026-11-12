import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-display text-5xl font-semibold">Not here</p>
      <p className="max-w-sm text-sm text-ink-muted">This link doesn&apos;t exist, or it was changed. Ask whoever sent it for the new one.</p>
      <Link href="/" className="text-sm font-medium text-signal hover:underline">
        Go to Wedora
      </Link>
    </div>
  );
}
