"use client";

import { useMemo, useState, useTransition, cloneElement, type ReactElement } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { saveDashboardLayout, type LayoutItem, type WidgetSize } from "./actions";

const ResponsiveGridLayout = WidthProvider(GridLayout);
const COLS = 12;
const ROW_HEIGHT = 30;
const SIZES: WidgetSize[] = ["sm", "md", "lg"];

// Uniform footprint per size preset — every widget at "S" is exactly this
// size, regardless of which widget it is; same for M/L. Fixed presets
// instead of freeform pixel-drag resizing, per request: predictable sizes
// that are simple to save/restore correctly, and every widget lines up
// with every other widget at the same size.
const SIZE_DIMENSIONS: Record<WidgetSize, { w: number; h: number }> = {
  sm: { w: 3, h: 6 },
  md: { w: 4, h: 9 },
  lg: { w: 6, h: 12 },
};

export type DashboardWidget = {
  id: string;
  // An already-instantiated element (built server-side in page.tsx with
  // its data) rather than raw content — DashboardGrid injects the current
  // `size` into it via cloneElement right before rendering, since
  // page.tsx can't know a size chosen later, client-side, ahead of time.
  // The underlying components (widget-cards.tsx) are Client Components
  // specifically so this actually re-renders when size changes.
  content: ReactElement;
  defaultSize: WidgetSize;
  defaultPosition: { x: number; y: number };
};

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="m14.7 6.3 3 3L19 8l1-1a4 4 0 0 0-5-5l-1 1 .7 .7ZM14.7 6.3 5 16l-1 4 4-1L17.7 9.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
    </svg>
  );
}

// Drag-to-move + a small S/M/L size picker per widget (schema_step45.sql
// follow-up) — same mental model as rearranging home-screen widgets on a
// phone: nothing is draggable until Edit Layout is on, and while it's on
// the whole card is the drag surface (a `draggableCancel` selector still
// keeps links/buttons inside each card clickable even then).
//
// Below ~640px this collapses to a plain stacked column instead of the
// 12-col grid — editing via touch-drag on a grid that narrow isn't
// something worth building for a first pass.
export function DashboardGrid({
  widgets,
  savedLayout,
}: {
  widgets: DashboardWidget[];
  savedLayout: LayoutItem[] | null;
}) {
  const defaultItems: LayoutItem[] = useMemo(
    () => widgets.map((w) => ({ i: w.id, x: w.defaultPosition.x, y: w.defaultPosition.y, size: w.defaultSize })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widgets.map((w) => w.id).join(",")],
  );

  // A previously-saved layout might be missing an entry for a widget that
  // didn't exist yet when it was saved (or no longer applies to this
  // user's role) — fall back to that widget's own default rather than
  // dropping it off the grid or crashing on a stale id.
  const initialItems: LayoutItem[] = useMemo(() => {
    if (!savedLayout || savedLayout.length === 0) return defaultItems;
    const byId = new Map(savedLayout.map((l) => [l.i, l]));
    return widgets.map(
      (w) => byId.get(w.id) ?? { i: w.id, x: w.defaultPosition.x, y: w.defaultPosition.y, size: w.defaultSize },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLayout, defaultItems]);

  const [items, setItems] = useState<LayoutItem[]>(initialItems);
  const [editMode, setEditMode] = useState(false);
  const [isPending, startTransition] = useTransition();

  // What react-grid-layout actually renders — w/h always derived fresh
  // from each item's `size`, never stored independently, so there's no
  // way for a saved size and its footprint to ever drift apart.
  //
  // Root cause of the browser-freeze incident: this used to be recomputed
  // as a brand-new array (with brand-new object literals) on *every*
  // render, unmemoized, and handed straight to react-grid-layout's
  // `layout` prop. RGL's own componentDidUpdate compares the incoming
  // layout against its previous one and, on anything it treats as a
  // change (a fresh object reference was enough), recomputes and fires
  // `onLayoutChange` — which called setItems — which triggered a
  // re-render — which built a fresh `rglLayout` array again — forever,
  // synchronously, with no yield back to the browser. That's exactly
  // what "Page Unresponsive" looks like. Memoizing on `items` means a
  // new array is only ever built when the data actually changes.
  const rglLayout: Layout[] = useMemo(
    () => items.map((it) => ({ i: it.i, x: it.x, y: it.y, ...SIZE_DIMENSIONS[it.size] })),
    [items],
  );

  function handlePositionsChange(next: Layout[]) {
    setItems((prev) => {
      const changed = prev.some((it) => {
        const match = next.find((n) => n.i === it.i);
        return match && (match.x !== it.x || match.y !== it.y);
      });
      // Extra belt-and-suspenders guard, on top of the useMemo above: RGL
      // can call onLayoutChange with positions identical to what we
      // already have (e.g. on mount). Skipping the setState entirely when
      // nothing actually moved means there's no re-render to feed a new
      // array back into RGL in the first place.
      if (!changed) return prev;
      return prev.map((it) => {
        const match = next.find((n) => n.i === it.i);
        return match ? { ...it, x: match.x, y: match.y } : it;
      });
    });
  }

  function setWidgetSize(id: string, size: WidgetSize) {
    setItems((prev) => prev.map((it) => (it.i === id ? { ...it, size } : it)));
  }

  function handleSave() {
    startTransition(async () => {
      await saveDashboardLayout(items);
      setEditMode(false);
    });
  }

  function handleReset() {
    setItems(defaultItems);
    startTransition(async () => {
      await saveDashboardLayout(null);
    });
  }

  const sizeById = new Map(items.map((it) => [it.i, it.size]));

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-1.5">
        {editMode ? (
          <>
            <p className="mr-auto text-xs text-slate-500">Drag a card to move it. Pick S / M / L to resize.</p>
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              title="Reset to Default"
              className="rounded-md p-1.5 text-slate-500 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
            >
              <ResetIcon />
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              title="Done"
              className="rounded-md bg-blue-600 p-1.5 text-ink hover:bg-blue-500 disabled:opacity-50"
            >
              <CheckIcon />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            title="Edit Layout"
            className="rounded-md p-1.5 text-slate-500 hover:bg-surface-2 hover:text-ink"
          >
            <PencilIcon />
          </button>
        )}
      </div>

      <div className="hidden sm:block">
        <ResponsiveGridLayout
          className="layout"
          layout={rglLayout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          isDraggable={editMode}
          isResizable={false}
          compactType={null}
          preventCollision
          draggableCancel="a, button"
          onDragStop={(layout: Layout[]) => handlePositionsChange(layout)}
          margin={[16, 16]}
        >
          {widgets.map((w) => {
            const size = sizeById.get(w.id) ?? w.defaultSize;
            return (
              <div
                key={w.id}
                className={`relative overflow-auto rounded-xl ${editMode ? "ring-2 ring-blue-500/40" : ""}`}
              >
                {editMode && (
                  <div className="absolute right-2 top-2 z-10 flex gap-1 rounded-md bg-surface/95 p-1 shadow">
                    {SIZES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setWidgetSize(w.id, s)}
                        title={s === "sm" ? "Small" : s === "md" ? "Medium" : "Large"}
                        className={`h-6 w-6 rounded text-[10px] font-semibold uppercase ${
                          size === s ? "bg-blue-600 text-ink" : "bg-surface-2 text-slate-500 hover:text-ink"
                        }`}
                      >
                        {s[0].toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
                {cloneElement(w.content, { size })}
              </div>
            );
          })}
        </ResponsiveGridLayout>
      </div>

      {/* Mobile fallback — plain stacked column, always full detail, not
          editable. */}
      <div className="space-y-6 sm:hidden">
        {[...widgets]
          .sort((a, b) => {
            const ia = items.find((i) => i.i === a.id);
            const ib = items.find((i) => i.i === b.id);
            return (ia?.y ?? 0) - (ib?.y ?? 0) || (ia?.x ?? 0) - (ib?.x ?? 0);
          })
          .map((w) => (
            <div key={w.id}>{cloneElement(w.content, { size: "lg" as WidgetSize })}</div>
          ))}
      </div>
    </div>
  );
}
