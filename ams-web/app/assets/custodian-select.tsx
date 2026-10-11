"use client";

import { useState } from "react";

const NEW_PERSON = "__new";

// Custodian drop-down for the internal asset form: everyone already on the
// register, "No custodian", and "Someone new…" which reveals a name field. The
// server reads custodian_select and, for "Someone new…", custodian_new
// (parseInternalAssetForm in actions.ts).
export function CustodianSelect({
  names,
  defaultValue,
  className,
}: {
  names: string[];
  defaultValue: string | null;
  className: string;
}) {
  const current = (defaultValue ?? "").trim();
  // The current holder is always offered, even if the list does not have them.
  const options = current && !names.some((n) => n.toLowerCase() === current.toLowerCase()) ? [current, ...names] : names;
  const initial = current ? (options.find((n) => n.toLowerCase() === current.toLowerCase()) ?? current) : "";
  const [choice, setChoice] = useState(initial);

  return (
    <div>
      <select
        name="custodian_select"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        className={className}
      >
        <option value="">No custodian</option>
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
        <option value={NEW_PERSON}>Someone new…</option>
      </select>
      {choice === NEW_PERSON && (
        <input
          name="custodian_new"
          required
          maxLength={120}
          placeholder="Full name of the new person"
          className={className}
        />
      )}
    </div>
  );
}
