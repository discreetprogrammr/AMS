"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { deleteAsset } from "./actions";

// Three-dot menu at the end of each row on /assets. "Edit" is also how you
// update an asset (status included) — the edit page is the same AssetForm
// used to create one, just pre-filled — so there's no separate "Update"
// entry that would just duplicate it.
//
// The menu renders through a portal into document.body with `position:
// fixed` coordinates computed from the button itself, rather than as a
// normal absolutely-positioned child. The table it lives in is wrapped in
// an `overflow-hidden` div (for the rounded corners) — a plain
// absolute/relative dropdown gets silently clipped for any row near the
// bottom or right edge of that container, which is exactly what was
// happening. Fixed-position + portal sidesteps ancestor overflow/clipping
// entirely.
export function AssetRowActions({
  assetId,
  assetTag,
}: {
  assetId: string;
  assetTag: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Anchoring is a one-time snapshot on open, so close instead of
    // drifting out of place if the table scrolls or the window resizes.
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label={`Actions for ${assetTag}`}
        aria-expanded={open}
        aria-haspopup="true"
        className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-surface-2 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", top: coords.top, right: coords.right }}
            className="z-50 w-36 overflow-hidden rounded-lg border border-hairline bg-surface shadow-xl shadow-black/30"
          >
            <Link
              href={`/assets/${assetId}`}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
            >
              Edit
            </Link>
            <form
              action={deleteAsset.bind(null, assetId)}
              onSubmit={(e) => {
                const ok = window.confirm(
                  `Delete asset ${assetTag}? This also removes its service records, tickets, and other linked history. This can't be undone.`,
                );
                if (!ok) {
                  e.preventDefault();
                  return;
                }
                setOpen(false);
              }}
            >
              <button
                type="submit"
                className="block w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
              >
                Delete
              </button>
            </form>
          </div>,
          document.body,
        )}
    </>
  );
}
