"use client";

import { Copy, Disc3, MessageCircle, QrCode } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { shareText } from "@/components/songs/song-bits";
import { Button, Sheet } from "@/components/ui";
import type { SongList } from "@/lib/types";

export function guestUrl(list: Pick<SongList, "submitSlug">) {
  return `${window.location.origin}/s/${list.submitSlug}`;
}

export function djUrl(list: Pick<SongList, "djSlug">) {
  return `${window.location.origin}/dj/${list.djSlug}`;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy — long-press the link instead");
  }
}

/** Buttons to send the guest form and the DJ list around. */
export function ShareButtons({ list, coupleNames, compact = false }: { list: SongList; coupleNames?: string | null; compact?: boolean }) {
  const [qrOpen, setQrOpen] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`https://wa.me/?text=${encodeURIComponent(shareText(list.kind, typeof window === "undefined" ? "" : guestUrl(list), coupleNames))}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-8 items-center gap-2 rounded-[8px] bg-[#1f9d55] px-2.5 text-[13px] font-medium text-white hover:brightness-110"
      >
        <MessageCircle className="size-4" />
        {compact ? "Share" : "Share on WhatsApp"}
      </a>
      <Button size="sm" onClick={() => void copy(guestUrl(list), "Guest link")}>
        <Copy className="size-4" /> {compact ? "Link" : "Copy guest link"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setQrOpen(true)} aria-label="QR code">
        <QrCode className="size-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void copy(djUrl(list), "DJ link")} title="Read-only run order for the DJ">
        <Disc3 className="size-4" /> {compact ? "DJ" : "Copy DJ link"}
      </Button>
      <QrSheet open={qrOpen} onClose={() => setQrOpen(false)} list={list} />
    </div>
  );
}

function QrSheet({ open, onClose, list }: { open: boolean; onClose: () => void; list: SongList }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    void QRCode.toDataURL(guestUrl(list), { width: 640, margin: 1, color: { dark: "#2b1512", light: "#fffdf9" } }).then(setSrc);
  }, [open, list]);
  return (
    <Sheet open={open} onClose={onClose} title="Scan to add a song">
      <div className="flex flex-col items-center gap-4 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL */}
        {src && <img src={src} alt={`QR code for ${list.title}`} className="w-full max-w-xs rounded-[12px] border border-rule" />}
        <p className="text-center text-sm text-ink-muted">Print it for the haldi table, or show it on your phone.</p>
        {src && (
          <a download={`${list.title}-qr.png`} href={src} className="text-sm font-medium text-signal hover:underline">
            Download PNG
          </a>
        )}
      </div>
    </Sheet>
  );
}
