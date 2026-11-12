"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Send, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui";
import { api } from "@/lib/api";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type DeviceState = "unsupported" | "needs-install" | "blocked" | "off" | "on" | "checking";

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** Phone notifications and the Telegram backup, set up from the Account page. */
export function NotifySettings() {
  const qc = useQueryClient();
  const { data: status } = useQuery({ queryKey: ["notify-status"], queryFn: api.notifyStatus });
  const [device, setDevice] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setDevice(isIos() && !isStandalone() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setDevice("blocked");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setDevice(sub ? "on" : "off");
    })();
  }, []);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["notify-status"] });

  const enablePush = async () => {
    if (!status?.push.publicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.push.publicKey),
        }));
      await api.subscribePush(sub.toJSON());
      setDevice("on");
      toast.success("Notifications are on for this device");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not turn on notifications");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api.unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setDevice("off");
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const connectTelegram = async () => {
    try {
      const { url } = await api.telegramLink();
      window.open(url, "_blank", "noopener");
      toast("Tap START in Telegram, then come back here", { duration: 8000 });
      // Pick up the link once they've pressed Start.
      setTimeout(refresh, 8000);
      setTimeout(refresh, 20000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect Telegram");
    }
  };

  const test = async () => {
    try {
      const r = await api.testNotify();
      if (r.push + r.telegram === 0) toast.error("Nothing is set up to receive alerts yet");
      else toast.success(`Sent to ${r.push} device${r.push === 1 ? "" : "s"}${r.telegram ? " and Telegram" : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send");
    }
  };

  return (
    <section className="mt-6 rounded-[10px] border border-rule-strong bg-raised p-3 md:p-4">
      <h2 className="flex items-center gap-2 font-display text-2xl leading-none text-ink">
        <BellRing className="size-5 text-marigold" />
        Reminders reach you…
      </h2>

      <div className="mt-4 space-y-4">
        <div className="flex flex-wrap items-start gap-3">
          <Smartphone className="mt-0.5 size-5 text-ink-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-ink">On this phone</p>
            <p className="text-[13px] text-ink-muted">
              {!status?.push.configured
                ? "Push isn't set up on the server yet (VAPID keys)."
                : device === "on"
                  ? `On. ${status.push.devices} device${status.push.devices === 1 ? "" : "s"} in total.`
                  : device === "needs-install"
                    ? "On iPhone: tap Share → Add to Home Screen, open Wedora from there, then come back here."
                    : device === "blocked"
                      ? "Notifications are blocked for this site. Allow them in the browser's site settings."
                      : device === "unsupported"
                        ? "This browser can't show notifications. Use Telegram below."
                        : "Off on this device."}
            </p>
          </div>
          {status?.push.configured && (device === "off" || device === "on") && (
            <Button size="sm" variant={device === "on" ? "outline" : "signal"} disabled={busy} onClick={device === "on" ? disablePush : enablePush}>
              {device === "on" ? "Turn off" : "Turn on"}
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <Send className="mt-0.5 size-5 text-ink-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-ink">Telegram</p>
            <p className="text-[13px] text-ink-muted">
              {!status?.telegram.configured
                ? "The Telegram bot isn't set up on the server yet."
                : status.telegram.linked
                  ? `Connected to @${status.telegram.botUsername}. Alerts come with Done / Snooze buttons.`
                  : "A backup that always rings, even when the browser is closed."}
            </p>
          </div>
          {status?.telegram.configured &&
            (status.telegram.linked ? (
              <Button size="sm" variant="ghost" onClick={() => void api.telegramUnlink().then(refresh)}>
                Disconnect
              </Button>
            ) : (
              <Button size="sm" variant="signal" onClick={connectTelegram}>
                Connect
              </Button>
            ))}
        </div>

        <Button size="sm" onClick={test}>
          Send me a test alert
        </Button>
      </div>
    </section>
  );
}
