"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

// The read-only "viewer" account (schema_step53.sql). Every control that would
// change something stays on screen, so the person building a mockup sees the
// real look and feel, but it does nothing:
//   - ViewOnlyProvider / useViewOnly(): the few controls that call a server
//     action straight from a click (not a form) read this and disable themselves.
//   - ViewOnlyGuard: catches every form submit that would write (server-action
//     forms and client-handled forms), says so, and dims those buttons. A form
//     that only navigates (a search or filter with an action path and GET) is
//     left alone.
// This is the UI layer only. The server refuses viewer writes (assertNotViewer,
// requireStaff) and the database refuses them too (restrictive RLS policies).

const ViewOnlyContext = createContext(false);

export function ViewOnlyProvider({ children }: { children: ReactNode }) {
  return <ViewOnlyContext.Provider value={true}>{children}</ViewOnlyContext.Provider>;
}

/** True inside a viewer's session. Outside the provider (every other role) it is false. */
export function useViewOnly(): boolean {
  return useContext(ViewOnlyContext);
}

const MESSAGE = "View-only account: this can't be changed.";

function toast() {
  const existing = document.getElementById("view-only-toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  el.id = "view-only-toast";
  el.setAttribute("role", "status");
  el.textContent = MESSAGE;
  el.style.cssText =
    "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;padding:10px 16px;" +
    "border-radius:10px;font-size:13px;font-weight:500;background:#1e3a8a;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.35)";
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 2600);
}

export function ViewOnlyGuard() {
  useEffect(() => {
    function onSubmit(e: Event) {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      const action = form.getAttribute("action") ?? "";
      const method = (form.getAttribute("method") ?? "get").toLowerCase();
      // A search or filter: a path as the action and the GET method. Anything else writes.
      if (action !== "" && !action.startsWith("javascript:") && method === "get") return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      toast();
    }
    document.addEventListener("submit", onSubmit, true);
    document.body.setAttribute("data-view-only", "true");
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.body.removeAttribute("data-view-only");
    };
  }, []);

  return (
    <style>{`
      body[data-view-only] form:not([action^="/"]) button[type="submit"],
      body[data-view-only] form:not([action^="/"]) input[type="submit"] {
        opacity: .55;
        cursor: not-allowed;
      }
    `}</style>
  );
}
