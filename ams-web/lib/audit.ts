// Compares an audit_log row's old_data/new_data JSON blobs and returns the
// field names that actually changed, so the UI can show something more
// useful than "this record was updated."
const IGNORED_FIELDS = new Set(["updated_at", "created_at"]);

export function changedFields(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
): string[] {
  if (!oldData || !newData) return [];

  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed: string[] = [];

  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      changed.push(key);
    }
  }

  return changed;
}
