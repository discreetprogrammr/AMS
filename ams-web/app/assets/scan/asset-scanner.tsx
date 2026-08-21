"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Matches the URL this same app prints onto a QR code (see
// generateQrDataUrl's call site in app/assets/[id]/page.tsx) — pulls the
// asset id straight out without a database round trip. Deliberately just
// matches the path shape, not a specific host, so a code generated on one
// deployment URL (localhost, a Vercel preview, the real production domain)
// still resolves correctly if scanned while browsing a different one.
const ASSET_URL_PATTERN = /\/assets\/([0-9a-f-]{36})/i;

type ScanState = "starting" | "scanning" | "resolving" | "error" | "no-camera";

// Camera-based QR/barcode reader for "scan the tag on-site, jump straight
// to the asset" — the field-technician entry point this whole feature is
// for. Two code paths once something's decoded:
//  1. It's one of OUR OWN generated QR codes (a full /assets/<id> URL) —
//     no lookup needed, the id is right there in the text.
//  2. It's anything else — most usefully, an OEM barcode already printed
//     on the equipment (serial number) — so it's tried as an exact
//     assets.serial_number match instead of assuming it's meaningless.
// A manual text-entry fallback covers desktops, denied camera permission,
// or browsers without camera support at all — this page should never be a
// dead end just because the camera didn't cooperate.
export function AssetScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [state, setState] = useState<ScanState>("starting");
  const [message, setMessage] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const resolvingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let controls: any = null;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("no-camera");
      setMessage(
        "Camera scanning isn't available in this browser (it needs HTTPS and camera support) — use the code entry below instead.",
      );
      return;
    }

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (cancelled || !videoRef.current) return;
        setState("scanning");
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result: any) => {
            // This fires continuously while scanning — most calls have no
            // result (nothing decodable in that frame yet), which is
            // completely normal and not an error condition.
            if (result && !cancelled && !resolvingRef.current) {
              resolvingRef.current = true;
              controls?.stop();
              void handleDecoded(result.getText());
            }
          },
        );
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setMessage(
            err instanceof Error
              ? `Couldn't access the camera: ${err.message}`
              : "Couldn't access the camera.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDecoded(text: string) {
    setState("resolving");
    setMessage(null);

    const urlMatch = text.match(ASSET_URL_PATTERN);
    if (urlMatch) {
      router.push(`/assets/${urlMatch[1]}`);
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("assets")
      .select("id")
      .eq("serial_number", text.trim())
      .maybeSingle();

    if (data) {
      router.push(`/assets/${data.id}`);
      return;
    }

    resolvingRef.current = false;
    setState("error");
    setMessage(`No asset found for "${text}". Try again, or search Assets manually.`);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (manualCode.trim()) void handleDecoded(manualCode.trim());
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
        <div className="relative aspect-square w-full bg-black">
          <video
            ref={videoRef}
            className="h-full w-full object-cover"
            muted
            playsInline
          />
          {state !== "scanning" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-6 text-center text-sm text-ink-soft">
              {state === "starting" && "Starting camera…"}
              {state === "resolving" && "Looking up asset…"}
              {(state === "error" || state === "no-camera") &&
                (message ?? "Something went wrong.")}
            </div>
          )}
        </div>
        <p className="border-t border-hairline px-4 py-3 text-center text-xs text-slate-500">
          Point the camera at an asset's QR tag, or an existing serial-number barcode.
        </p>
      </div>

      <form
        onSubmit={handleManualSubmit}
        className="mt-4 flex items-center gap-2 rounded-xl border border-hairline bg-surface p-3"
      >
        <input
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Or type a serial number / code manually"
          className="flex-1 rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500"
        >
          Go
        </button>
      </form>
    </div>
  );
}
