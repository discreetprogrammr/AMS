"use client";

// A submit button that asks first. Used for the stocktake's destructive or
// final actions (complete, delete), inside a server-action <form>.
export function ConfirmButton({
  message,
  className,
  children,
}: {
  message: string;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
