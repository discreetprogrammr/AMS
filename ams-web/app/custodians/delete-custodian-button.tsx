"use client";

import { deleteCustodian } from "./actions";

// Delete is only offered for someone with a profile and no items; the server
// re-checks and refuses if any internal item still names them.
export function DeleteCustodianButton({ name }: { name: string }) {
  return (
    <form
      action={deleteCustodian.bind(null, name)}
      onSubmit={(e) => {
        if (!window.confirm(`Delete "${name}" from the custodian list? This can't be undone.`)) e.preventDefault();
      }}
      className="mb-6"
    >
      <button type="submit" className="rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10">
        Delete custodian
      </button>
    </form>
  );
}
