"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";

/** Entry point: straight to Today when signed in, otherwise to login. */
export default function HomePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (isPending) return;
    router.replace(session?.user ? "/today" : "/login");
  }, [isPending, session, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <p className="font-display text-4xl font-semibold tracking-tight">
        Wed<span className="italic text-signal">ora</span>
      </p>
    </div>
  );
}
