"use client";

import { ChevronRight, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MORE_LINKS } from "@/components/nav-links";
import { authClient } from "@/lib/auth-client";

export default function MorePage() {
  const router = useRouter();
  return (
    <div className="mx-auto w-full max-w-xl px-3 py-5">
      <h1 className="font-display text-4xl font-semibold leading-none tracking-tight">More</h1>
      <ul className="mt-5 divide-y divide-rule overflow-hidden rounded-[12px] border border-rule-strong bg-raised">
        {MORE_LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="flex items-center gap-3 px-3 py-3.5 hover:bg-sunken">
              <l.icon className="size-5 text-marigold" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{l.label}</span>
                <span className="block truncate text-[12px] text-ink-muted">{l.hint}</span>
              </span>
              <ChevronRight className="size-4 text-ink-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={async () => {
          await authClient.signOut();
          router.replace("/login");
        }}
        className="mt-5 flex items-center gap-2 px-1 text-[14px] text-ink-muted hover:text-urgent"
      >
        <LogOut className="size-4" /> Sign out
      </button>
    </div>
  );
}
