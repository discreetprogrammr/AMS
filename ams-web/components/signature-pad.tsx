"use client";

// Canvas-based digital signature capture, adapted from the reference app's
// SignaturePad.tsx (same pointer-event drawing approach), restyled to
// AMS's design tokens. Fully self-contained: draws to a canvas, and on
// every stroke release serializes the drawing to a PNG data URL into its
// own hidden <input>, so it can just be dropped into any <form> without
// the parent component needing to manage signature state itself — same
// pattern PreventiveChecklistForm already uses for its checklist grid.
import { useEffect, useRef, useState } from "react";

export function SignaturePad({
  name,
  label,
}: {
  name: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dataUrl, setDataUrl] = useState("");
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * ratio;
    c.height = rect.height * ratio;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    // Canvas strokeStyle doesn't reliably resolve CSS var()/color-mix(), so
    // read the resolved --c-ink channel triplet (e.g. "226 232 240") at
    // draw time instead — keeps the pen color legible in both the dark
    // and light theme (see globals.css) without hardcoding either one.
    const inkChannels = getComputedStyle(document.documentElement)
      .getPropertyValue("--c-ink")
      .trim();
    ctx.strokeStyle = inkChannels ? `rgb(${inkChannels})` : "#e2e8f0";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function down(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    setDataUrl(canvasRef.current!.toDataURL("image/png"));
  }

  function clear() {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    setDataUrl("");
  }

  return (
    <div>
      <input type="hidden" name={name} value={dataUrl} />
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[11px] font-semibold tracking-wide text-slate-500">
          {label}
        </label>
        <button
          type="button"
          onClick={clear}
          className="text-[11px] text-slate-500 hover:text-ink-soft"
        >
          Clear
        </button>
      </div>
      <div className="relative h-32 rounded-lg border border-hairline bg-surface-2">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair touch-none rounded-lg"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-xs text-slate-500">
            Sign here
          </div>
        )}
      </div>
    </div>
  );
}
