"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { deleteOrganization } from "./actions";

// Three-dot menu at the end of each row on /clients — same pattern as
// app/assets/asset-row-actions.tsx (portal into document.body, `position:
// fixed` coordinates from the button itself) so it doesn't get clipped by
// the table's `overflow-hidden` wrapper. "Edit" goes to the client's
// detail page, which is also where you edit it (same page, no separate
// "Update" entry needed).
export function ClientRowActions({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
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
        aria-label={`Actions for ${organizationName}`}
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
              href={`/clients/${organizationId}`}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-ink-soft hover:bg-surface-2 hover:text-ink"
            >
              Edit
            </Link>
            <form
              action={deleteOrganization.bind(null, organizationId)}
              onSubmit={(e) => {
                const ok = window.confirm(
                  `Delete ${organizationName}? This also removes its sites and registered assets (and everything linked to them — tickets, service records, certificates, and more). This can't be undone.`,
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
