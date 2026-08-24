"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserAvatar } from "./user-avatar";
import { uploadAvatar, removeAvatar } from "@/app/profile/avatar-actions";
import { MAX_AVATAR_BYTES } from "@/lib/avatar";

// Interactive avatar picker for My Profile (app/profile/page.tsx) — click
// the circle (or the camera badge) to pick an image, uploads immediately on
// selection rather than needing a separate "Save" click, the more familiar
// pattern for a profile picture (Slack/Gmail-style) vs. the rest of this
// page's plain <form action> fields. Client-invoked throw-on-error action +
// router.refresh(), same shape as upload-document-modal.tsx.
export function AvatarUpload({
  fullName,
  avatarUrl,
}: {
  fullName: string | null;
  avatarUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image is too large (max 5MB).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      await uploadAvatar(formData);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    setError(null);
    try {
      await removeAvatar();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          title="Change profile picture"
          className="block rounded-full ring-2 ring-transparent transition hover:ring-blue-500/50 disabled:opacity-50"
        >
          <UserAvatar
            fullName={fullName}
            avatarUrl={avatarUrl}
            sizeClass="h-16 w-16"
            textClass="text-lg"
          />
        </button>
        <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 ring-2 ring-surface">
          <CameraIcon />
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">
          {busy ? "Uploading…" : "Profile picture"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="text-blue-400 hover:underline disabled:opacity-50"
          >
            Upload new
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="text-ink-soft hover:underline disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        {!error && <p className="mt-1 text-[11px] text-slate-500">JPG or PNG, up to 5MB.</p>}
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 text-ink-soft"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
