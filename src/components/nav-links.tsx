"use client";

import { CalendarHeart, CheckSquare, Gift, IndianRupee, LayoutGrid, Music, Sparkles, User, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/format";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof CheckSquare;
  /** When set, this entry is active only if ?scope= matches. */
  scope?: "mine";
  desktop?: boolean;
  mobile?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/today", label: "Today", icon: Sparkles, desktop: true, mobile: true },
  { href: "/tasks", label: "To-dos", icon: CheckSquare, desktop: true, mobile: true },
  { href: "/tasks?scope=mine", label: "Mine", icon: User, scope: "mine", desktop: true },
  { href: "/songs", label: "Songs", icon: Music, desktop: true, mobile: true },
  { href: "/vendors", label: "Vendors", icon: IndianRupee, desktop: true, mobile: true },
  { href: "/functions", label: "Functions", icon: CalendarHeart, desktop: true },
  { href: "/gifts", label: "Chandla", icon: Gift, desktop: true },
  { href: "/team", label: "Family", icon: Users, desktop: true },
  { href: "/more", label: "More", icon: LayoutGrid, mobile: true },
];

/** Pages reached from "More" on a phone, so the tab stays lit there. */
const MORE_PAGES = ["/more", "/functions", "/gifts", "/team", "/account"];

function useIsActive() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = searchParams.get("scope");

  return (item: NavItem, mobile = false) => {
    const base = item.href.split("?")[0]!;
    if (mobile && base === "/more") return MORE_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
    if (pathname !== base && !pathname.startsWith(`${base}/`)) return false;
    if (base !== "/tasks") return true;
    if (mobile) return true;
    return item.scope ? scope === item.scope : !scope || scope === "all";
  };
}

export function SidebarNav() {
  const isActive = useIsActive();
  return (
    <>
      {NAV_ITEMS.filter((i) => i.desktop).map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-sm transition-colors",
            isActive(item) ? "bg-raised font-medium text-ink shadow-[inset_2px_0_0_var(--marigold)]" : "text-ink-soft hover:bg-raised/70",
          )}
        >
          <item.icon className="size-4 text-ink-muted" />
          {item.label}
        </Link>
      ))}
    </>
  );
}

export function MobileNav() {
  const isActive = useIsActive();
  return (
    <>
      {NAV_ITEMS.filter((i) => i.mobile).map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px]",
            isActive(item, true) ? "text-signal" : "text-ink-muted",
          )}
        >
          <item.icon className="size-5" />
          {item.label}
        </Link>
      ))}
    </>
  );
}

export const MORE_LINKS = [
  { href: "/functions", label: "Functions & run-sheet", hint: "Mehndi, sangeet, hast melap — timings and who does what", icon: CalendarHeart },
  { href: "/gifts", label: "Chandla register", hint: "Who gave what, at the desk", icon: Gift },
  { href: "/tasks?scope=mine", label: "My to-dos", hint: "Only what's assigned to you", icon: User },
  { href: "/team", label: "Family", hint: "Who's helping, and the join code", icon: Users },
  { href: "/account", label: "Account & alerts", hint: "Phone notifications, Telegram, passcode", icon: User },
];
