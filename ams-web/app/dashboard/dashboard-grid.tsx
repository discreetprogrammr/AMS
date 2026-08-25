"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { saveDashboardLayout, type LayoutItem } from "./actions";

const ResponsiveGridLayout = WidthProvider(GridLayout);
const COLS = 12;
const ROW_HEIGHT = 30;

export type DashboardWidget = {
  id: string;
  content: ReactNode;
  defaultLayout: { x: number; y: number; w: number; h: number };
};

// Drag-to-move, drag-the-corner-to-resize dashboard widgets
// (schema_step45.sql) — same mental model as rearranging home-screen
// widgets on a phone: nothing is draggable until Edit Layout is on, and
// while it's on the whole card becomes the drag surface (so links/buttons
// inside cards keep working normally outside edit mode, same as an app
// icon not launching while it's "wiggling").
//
// Below ~640px this collapses to a plain stacked column instead of the
// 12-col grid — react-grid-layout's items would otherwise get squeezed
// into slivers on a phone-width screen, and editing via touch-drag on a
// grid that narrow isn't something worth building for a first pass.
export function DashboardGrid({
  widgets,
  savedLayout,
}: {
  widgets: DashboardWidget[];
  savedLayout: LayoutItem[] | null;
}) {
  const defaultLayout: Layout[] = useMemo(
    () => widgets.map((w) => ({ i: w.id, ...w.defaultLayout })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [widgets.map((w) => w.id).join(",")],
  );

  // A previously-saved layout might be missing an entry for a widget that
  // didn't exist yet when it was saved (or vice versa, one that no longer
  // applies to this user's role) — fall back to that widget's own default
  // rather than dropping it off the grid or crashing on a stale id.
  const initialLayout: Layout[] = useMemo(() => {
    if (!savedLayout || savedLayout.length === 0) return defaultLayout;
    const byId = new Map(savedLayout.map((l) => [l.i, l]));
    return widgets.map((w) => byId.get(w.id) ?? { i: w.id, ...w.defaultLayout });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedLayout, defaultLayout]);

  const [layout, setLayout] = useState<Layout[]>(initialLayout);
  const [editMode, setEditMode] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      await saveDashboardLayout(layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })));
      setEditMode(false);
    });
  }

  function handleReset() {
    setLayout(defaultLayout);
    startTransition(async () => {
      await saveDashboardLayout(null);
    });
  }

  const contentById = new Map(widgets.map((w) => [w.id, w.content]));

  return (
    <div>
      <div className="mb-4 flex items-center justify-end gap-2">
        {editMode ? (
          <>
            <p className="mr-auto text-xs text-slate-500">
              Drag a card to move it, or drag its bottom-right corner to resize.
            </p>
            <button
              type="button"
              onClick={handleReset}
              disabled={isPending}
              className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-2 disabled:opacity-50"
            >
              Reset to Default
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-ink hover:bg-blue-500 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Done"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className="rounded-lg border border-hairline px-3 py-1.5 text-xs text-ink-soft hover:bg-surface-2"
          >
            Edit Layout
          </button>
        )}
      </div>

      <div className="hidden sm:block">
        <ResponsiveGridLayout
          className="layout"
          layout={layout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          isDraggable={editMode}
          isResizable={editMode}
          draggableCancel="a, button"
          onLayoutChange={(next: Layout[]) => setLayout(next)}
          margin={[16, 16]}
        >
          {widgets.map((w) => (
            <div
              key={w.id}
              className={`overflow-auto rounded-xl ${editMode ? "ring-2 ring-blue-500/40" : ""}`}
            >
              {contentById.get(w.id)}
            </div>
          ))}
        </ResponsiveGridLayout>
      </div>

      {/* Mobile fallback — plain stacked column in the same top-to-bottom
          reading order as the current layout, not editable. */}
      <div className="space-y-6 sm:hidden">
        {[...widgets]
          .sort((a, b) => {
            const la = layout.find((l) => l.i === a.id);
            const lb = layout.find((l) => l.i === b.id);
            return (la?.y ?? 0) - (lb?.y ?? 0) || (la?.x ?? 0) - (lb?.x ?? 0);
          })
          .map((w) => (
            <div key={w.id}>{w.content}</div>
          ))}
      </div>
    </div>
  );
}
