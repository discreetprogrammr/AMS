"use client";

import {
  Children,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { saveDashboardLayout, type LayoutItem, type WidgetSize } from "./actions";

const COLS = 12;
const ROW_HEIGHT = 30;
const SIZES: WidgetSize[] = ["sm", "md", "lg"];
// Sane default matching react-grid-layout's own WidthProvider default —
// only ever visible for the first frame before ResizeObserver reports the
// real width.
const DEFAULT_GRID_WIDTH = 1280;

// Deliberately NOT using react-grid-layout's own WidthProvider HOC here —
// root cause of the recurring browser-freeze incidents. WidthProvider is a
// class component that calls `this.setState({ width })` on *every single*
// ResizeObserver notification with no check for whether the width actually
// changed, and class components re-render on every setState regardless of
// whether the new value differs. If a render nudges the container's
// measured width by even a sub-pixel (e.g. a scrollbar toggling, or the
// grid's own re-render changing document height right at the viewport
// boundary), that re-triggers the observer, which re-renders, which can
// nudge it again — a feedback loop that spans React's async render cycle,
// so it never trips the browser's own same-frame ResizeObserver loop
// guard. That matches every symptom seen: freezes on mount (not just
// during drag), no console errors, no server involvement at all.
// This replaces it with a function-component + useState version of the
// same idea, but with an actual equality check — React 18 bails out of
// re-rendering a function component when useState's setter is called with
// a value that hasn't changed, which is exactly the safety net
// WidthProvider's class-component implementation doesn't have.
function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_GRID_WIDTH);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new ResizeObserver((entries) => {
      const measured = Math.round(entries[0].contentRect.width);
      setWidth((prev) => (prev === measured ? prev : measured));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}

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

// Metadata only — deliberately NOT carrying a `content: ReactElement` field
// anymore. Second root cause of the freeze incidents: this array used to
// hold one already-built ReactElement per widget and got passed straight
// into DashboardGrid as a prop. Every one of those elements' own props
// (ticket lists, compliance dates, activity rows — real Supabase data) had
// to be serialized across the Server → Client Component boundary as part
// of *this* prop, and that serialization pass was where the request
// actually hung — server logs showed every single Supabase query
// finishing in under a second, reaching the final `return` statement, and
// then nothing: no error, no response, until Vercel's own 300s watchdog
// killed the function. Passing elements as `children` instead (the
// conventional, well-trodden Server→Client slot pattern) sidesteps
// whatever in that specific prop-serialization path was hanging.
export type DashboardWidget = {
  id: string;
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
  children,
}: {
  widgets: DashboardWidget[];
  savedLayout: LayoutItem[] | null;
  // The actual widget elements (KpiCard, ActiveTicketsCard, etc.), in the
  // exact same order as `widgets` — page.tsx renders them as ordinary JSX
  // children rather than building them into the `widgets` array, see the
  // comment on DashboardWidget above for why. Matched back up to each
  // widget's id purely by array position (Children.toArray preserves
  // order), not by React's internal `.key`, since key values aren't a
  // reliable public API to read back out.
  children: ReactNode;
}) {
  const contentById = useMemo(() => {
    const childArray = Children.toArray(children) as ReactElement[];
    return new Map(widgets.map((w, i) => [w.id, childArray[i]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets, children]);

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
  const { ref: gridContainerRef, width: gridWidth } = useContainerWidth();

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

      <div ref={gridContainerRef} className="hidden sm:block">
        <GridLayout
          className="layout"
          width={gridWidth}
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
                {(() => {
                  const content = contentById.get(w.id);
                  return content ? cloneElement(content, { size }) : null;
                })()}
              </div>
            );
          })}
        </GridLayout>
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
          .map((w) => {
            const content = contentById.get(w.id);
            return <div key={w.id}>{content ? cloneElement(content, { size: "lg" as WidgetSize }) : null}</div>;
          })}
      </div>
    </div>
  );
}
