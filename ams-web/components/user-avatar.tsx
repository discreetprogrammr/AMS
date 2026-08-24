import { initials } from "@/lib/avatar";

// Pure presentational — image if avatar_url is set, initials circle
// otherwise (schema_step38.sql). Used read-only in the sidebar, and wrapped
// with upload/remove controls by avatar-upload.tsx on My Profile. Plain
// <img> rather than next/image throughout — avatar_url is a Supabase
// Storage public URL, not a local asset next/image can optimize.
export function UserAvatar({
  fullName,
  avatarUrl,
  sizeClass = "h-9 w-9",
  textClass = "text-xs",
}: {
  fullName: string | null | undefined;
  avatarUrl: string | null | undefined;
  sizeClass?: string;
  textClass?: string;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={fullName ?? "User"}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-blue-600 ${textClass} font-bold text-ink`}
    >
      {initials(fullName)}
    </div>
  );
}
