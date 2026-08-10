// Plain GET form — no client JS needed, the browser handles the
// navigation to `${action}?q=...` on submit. The destination page reads
// `q` from its own searchParams and filters server-side.
export function SearchBar({
  action,
  placeholder = "Search assets…",
  defaultValue = "",
}: {
  action: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <form action={action} method="GET" className="relative">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="text"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-10 w-52 rounded-lg border border-hairline bg-surface-2 pl-9 pr-3 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none sm:w-64"
      />
    </form>
  );
}
