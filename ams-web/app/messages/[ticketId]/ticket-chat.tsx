"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useCall, type CallEvent } from "@/lib/webrtc/use-call";
import {
  unlockAudioOnFirstInteraction,
  playSentTone,
  playReceivedTone,
  startRingtone,
  stopRingtone,
  startRingback,
  stopRingback,
} from "@/lib/sounds";
import { MAX_ATTACHMENT_BYTES, makeAttachmentPath, formatFileSize, isImageMime } from "@/lib/attachments";

type Message = {
  id: string;
  ticket_id: string;
  sender_id: string | null;
  message_type: "text" | "call_started" | "call_ended" | "call_missed" | "call_declined";
  call_kind: "audio" | "video" | null;
  body: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  created_at: string;
  profiles: { full_name: string | null } | null;
};

// Reused everywhere a message row is fetched/inserted, so the shape stays
// consistent (schema_step27.sql added the attachment_* columns).
const MESSAGE_SELECT =
  "id, ticket_id, sender_id, message_type, call_kind, body, attachment_path, attachment_name, attachment_mime, attachment_size, created_at, profiles(full_name)";

function PhoneIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  );
}

function VideoIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m23 7-7 5 7 5V7Z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function MicOffIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6M17 16.95A7 7 0 0 1 5 12v-2M19 12v0a7 7 0 0 1-.11 1.23M12 19v3M8 22h8" />
    </svg>
  );
}

function MicIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8" />
    </svg>
  );
}

function VideoOffIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h4a2 2 0 0 1 2 2v2m5-4L1 21" />
    </svg>
  );
}

function HangupIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 9c-2.5 0-4.86.63-6.92 1.74a1.5 1.5 0 0 0-.62 2.05l1.2 2.24a1.5 1.5 0 0 0 1.94.63c.68-.3 1.4-.53 2.15-.68a1.5 1.5 0 0 0 1.2-1.47v-1.02c.66-.1 1.34-.15 2.05-.15s1.39.05 2.05.15v1.02c0 .72.5 1.33 1.2 1.47.75.15 1.47.38 2.15.68a1.5 1.5 0 0 0 1.94-.63l1.2-2.24a1.5 1.5 0 0 0-.62-2.05A16.4 16.4 0 0 0 12 9Z" />
    </svg>
  );
}

function CloseIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PaperclipIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.67 3.67 0 0 1 5.19 5.19l-9.2 9.19a1.83 1.83 0 0 1-2.59-2.59l8.49-8.48" />
    </svg>
  );
}

function FileIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function DownloadIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v12m0 0-4-4m4 4 4-4M4 21h16" />
    </svg>
  );
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function callLabel(kind: "audio" | "video" | null, type: Message["message_type"]): string {
  const k = kind === "video" ? "Video" : "Voice";
  switch (type) {
    case "call_started":
      return `${k} call`;
    case "call_ended":
      return `${k} call ended`;
    case "call_missed":
      return `Missed ${k.toLowerCase()} call`;
    case "call_declined":
      return `${k} call declined`;
    default:
      return "";
  }
}

export function TicketChat({
  ticketId,
  currentUserId,
  currentUserName,
  initialMessages,
}: {
  ticketId: string;
  currentUserId: string;
  currentUserName: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = useRef(createClient()).current;
  const router = useRouter();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again later
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setAttachError(
        `"${file.name}" is too large — attachments are limited to ${formatFileSize(MAX_ATTACHMENT_BYTES)}.`,
      );
      return;
    }
    setAttachError(null);
    setPendingFile(file);
  }

  // Marks this ticket's thread as read for the current user as of right
  // now (schema_step26.sql's message_reads) — drives the sidebar's
  // notification dot and the inbox's "New" indicator. Safe to call
  // liberally: it's just "how far I've seen", not a one-shot action.
  async function markRead() {
    await supabase
      .from("message_reads")
      .upsert(
        { user_id: currentUserId, ticket_id: ticketId, last_read_at: new Date().toISOString() },
        { onConflict: "user_id,ticket_id" },
      );
  }

  // Mark read as soon as the thread is open — whatever's in
  // initialMessages has, by definition, just been seen.
  useEffect(() => {
    markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  // Live-updating message list — postgres_changes needs `messages` in the
  // supabase_realtime publication (schema_step25.sql's last line).
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${ticketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `ticket_id=eq.${ticketId}` },
        async (payload) => {
          const id = payload.new.id as string;
          const senderId = payload.new.sender_id as string | null;
          const messageType = payload.new.message_type as Message["message_type"];
          const fromSomeoneElse = !!senderId && senderId !== currentUserId;
          // Add the raw row immediately for a snappy UI — postgres_changes
          // payloads are plain table rows with no joins, so it won't have
          // the sender's name yet. Patch that in via a follow-up select
          // (which DOES support the profiles(full_name) embed and
          // respects the same RLS as everything else) right after.
          setMessages((prev) => {
            if (prev.some((m) => m.id === id)) return prev;
            return [...prev, payload.new as Message];
          });
          if (fromSomeoneElse) {
            // The thread is open right now, so this counts as read the
            // instant it arrives — keeps the sidebar dot from lighting up
            // for a ticket the user is actively looking at.
            markRead();
            if (messageType === "text") playReceivedTone();
          }
          const { data } = await supabase
            .from("messages")
            .select(MESSAGE_SELECT)
            .eq("id", id)
            .single();
          if (data) {
            setMessages((prev) =>
              prev.map((m) => (m.id === id ? (data as unknown as Message) : m)),
            );
          }
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Browsers won't let a programmatic (non-click-triggered) sound — like
  // an incoming-call ring — play until the page has seen a real user
  // gesture. This "primes" it as soon as the thread mounts, so simply
  // having tapped into the Messages tab is enough; no separate prompt.
  useEffect(() => {
    unlockAudioOnFirstInteraction();
  }, []);

  async function logCallEvent(event: CallEvent) {
    const type = event.type === "call_started" ? "call_started" : event.type;
    const { data } = await supabase
      .from("messages")
      .insert({
        ticket_id: ticketId,
        sender_id: currentUserId,
        message_type: type,
        call_kind: event.kind,
      })
      .select(MESSAGE_SELECT)
      .single();
    if (data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as unknown as Message]));
    }
  }

  const call = useCall({
    ticketId,
    userId: currentUserId,
    userName: currentUserName,
    onCallEvent: logCallEvent,
  });

  // Ringtone while someone's calling us, ringback while we're calling
  // someone — both stop themselves as soon as the underlying state clears
  // (accepted/declined/hung up/missed), and on unmount just in case.
  useEffect(() => {
    if (call.incoming) startRingtone();
    else stopRingtone();
    return () => stopRingtone();
  }, [call.incoming]);

  useEffect(() => {
    if (call.status === "calling") startRingback();
    else stopRingback();
    return () => stopRingback();
  }, [call.status]);

  async function sendMessage() {
    const body = draft.trim();
    const file = pendingFile;
    if ((!body && !file) || sending) return;
    setSending(true);
    setDraft("");
    setPendingFile(null);
    setAttachError(null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertRow: Record<string, any> = {
      ticket_id: ticketId,
      sender_id: currentUserId,
      message_type: "text",
      body: body || null,
    };

    if (file) {
      const path = makeAttachmentPath(ticketId, file.name);
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (uploadError) {
        setSending(false);
        setAttachError(`Couldn't attach "${file.name}" — ${uploadError.message}`);
        setDraft(body); // give the caption back so it isn't lost
        return;
      }
      insertRow.attachment_path = path;
      insertRow.attachment_name = file.name;
      insertRow.attachment_mime = file.type || null;
      insertRow.attachment_size = file.size;
    }

    const { data, error } = await supabase
      .from("messages")
      .insert(insertRow)
      .select(MESSAGE_SELECT)
      .single();
    setSending(false);
    if (!error && data) {
      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as unknown as Message]));
      playSentTone();
    } else if (error) {
      setAttachError(error.message);
    }
  }

  const inCallOverlay = call.status !== "idle" && call.status !== "ringing";

  return (
    <div className="relative flex h-[calc(100vh-160px)] flex-col overflow-hidden rounded-xl border border-hairline bg-surface sm:h-[calc(100vh-180px)]">
      {/* Incoming call banner — pinned to the top of the VIEWPORT (not
          just this card) with `fixed`, so Accept/Decline are immediately
          visible on mobile regardless of scroll position or how tall the
          page header above the chat card happens to be. It used to be an
          inline banner inside the card, which could end up below the
          fold on phones. */}
      {call.incoming && (
        <div className="fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
          <div className="flex w-full max-w-lg flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-500/40 bg-surface px-4 py-3 shadow-2xl sm:px-6">
            <div className="flex items-center gap-2 text-sm text-blue-200">
              {call.incoming.kind === "video" ? <VideoIcon className="h-4 w-4" /> : <PhoneIcon className="h-4 w-4" />}
              <span>
                <strong>{call.incoming.fromName}</strong> is calling ({call.incoming.kind === "video" ? "video" : "voice"})…
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={call.declineCall}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={call.acceptCall}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-ink hover:bg-emerald-500"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {call.error && (
        <p className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400 sm:px-6">
          {call.error}
        </p>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3 sm:px-6">
        <span className="text-sm font-medium text-ink-soft">Conversation</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => call.startCall("audio")}
            disabled={call.status !== "idle"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            title="Start voice call"
            aria-label="Start voice call"
          >
            <PhoneIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => call.startCall("video")}
            disabled={call.status !== "idle"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-ink-soft hover:bg-surface-2 hover:text-ink disabled:opacity-40"
            title="Start video call"
            aria-label="Start video call"
          >
            <VideoIcon className="h-4 w-4" />
          </button>
          <span className="mx-1 h-5 w-px bg-hairline" aria-hidden="true" />
          <button
            type="button"
            onClick={() => router.push("/messages")}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-hairline text-ink-soft hover:bg-surface-2 hover:text-ink"
            title="Close conversation"
            aria-label="Close conversation"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Message list */}
      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">
            No messages yet — say hello, or start a call above.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === currentUserId;
          if (m.message_type !== "text") {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-slate-500">
                  {callLabel(m.call_kind, m.message_type)} · {timeLabel(m.created_at)}
                </span>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-xl px-3.5 py-2 text-sm sm:max-w-[65%] ${mine ? "bg-blue-600 text-ink" : "bg-surface-2 text-ink"}`}>
                {!mine && (
                  <p className="mb-0.5 text-xs font-semibold text-blue-300">
                    {/* A client_viewer can only read their OWN profiles row
                        (schema.sql's "read own profile or all if staff"
                        policy) — so a staff sender's name comes back null
                        here for a client, same as intended: falls back to
                        a generic "Support" label rather than exposing
                        individual staff names to clients. Staff viewing
                        client messages always see the real name, since
                        is_internal_staff() bypasses that restriction. */}
                    {m.profiles?.full_name ?? "Support"}
                  </p>
                )}
                {m.attachment_path && (
                  <AttachmentBubble
                    supabase={supabase}
                    path={m.attachment_path}
                    name={m.attachment_name}
                    mime={m.attachment_mime}
                    size={m.attachment_size}
                    mine={mine}
                  />
                )}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                <p className={`mt-1 text-[10px] ${mine ? "text-blue-100/70" : "text-slate-500"}`}>
                  {timeLabel(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-hairline">
        {attachError && (
          <p className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400 sm:px-6">
            {attachError}
          </p>
        )}
        {pendingFile && (
          <div className="flex items-center gap-2 border-b border-hairline bg-surface-2 px-4 py-2 text-xs text-ink-soft sm:px-6">
            <FileIcon className="h-4 w-4 shrink-0" />
            <span className="truncate">{pendingFile.name}</span>
            <span className="shrink-0 text-slate-500">{formatFileSize(pendingFile.size)}</span>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              className="ml-auto shrink-0 rounded p-1 text-slate-500 hover:bg-surface hover:text-ink"
              aria-label="Remove attachment"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-end gap-2 p-3 sm:p-4"
        >
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline text-ink-soft hover:bg-surface-2 hover:text-ink"
            title="Attach a file or photo"
            aria-label="Attach a file or photo"
          >
            <PaperclipIcon className="h-4 w-4" />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            rows={1}
            placeholder="Type a message…"
            className="max-h-32 flex-1 resize-none rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={(!draft.trim() && !pendingFile) || sending}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-ink hover:bg-blue-500 disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      </div>

      {/* In-call overlay — covers the thread while calling/connecting/active */}
      {inCallOverlay && (
        <CallOverlay
          status={call.status}
          kind={call.kind}
          localStream={call.localStream}
          remoteStream={call.remoteStream}
          muted={call.muted}
          cameraOff={call.cameraOff}
          onToggleMute={call.toggleMute}
          onToggleCamera={call.toggleCamera}
          onHangUp={call.hangUp}
        />
      )}
    </div>
  );
}

function CallOverlay({
  status,
  kind,
  localStream,
  remoteStream,
  muted,
  cameraOff,
  onToggleMute,
  onToggleCamera,
  onHangUp,
}: {
  status: string;
  kind: "audio" | "video" | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onHangUp: () => void;
}) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const isVideo = kind === "video";

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => {
    if (isVideo && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (!isVideo && remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, isVideo]);

  const statusLabel =
    status === "calling" ? "Calling…" : status === "connecting" ? "Connecting…" : "In call";

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-base">
      <div className="relative flex-1 overflow-hidden">
        {isVideo ? (
          <>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full bg-black object-cover"
            />
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute right-3 top-3 h-28 w-20 rounded-lg border border-hairline bg-black object-cover shadow-lg sm:h-36 sm:w-28"
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-ink">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600/20 text-blue-300">
              <PhoneIcon className="h-8 w-8" />
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={remoteAudioRef} autoPlay />
          </div>
        )}
        <div className="absolute left-0 right-0 top-3 flex justify-center">
          <span className="rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
            {statusLabel}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 border-t border-hairline bg-surface p-4 sm:p-6">
        <button
          type="button"
          onClick={onToggleMute}
          className={`flex h-12 w-12 items-center justify-center rounded-full ${muted ? "bg-red-500/20 text-red-400" : "bg-surface-2 text-ink-soft"} hover:opacity-80`}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOffIcon /> : <MicIcon />}
        </button>
        {isVideo && (
          <button
            type="button"
            onClick={onToggleCamera}
            className={`flex h-12 w-12 items-center justify-center rounded-full ${cameraOff ? "bg-red-500/20 text-red-400" : "bg-surface-2 text-ink-soft"} hover:opacity-80`}
            aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
          >
            {cameraOff ? <VideoOffIcon /> : <VideoIcon />}
          </button>
        )}
        <button
          type="button"
          onClick={onHangUp}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-ink hover:bg-red-500"
          aria-label="Hang up"
        >
          <HangupIcon className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

// A message's attachment_path is a private-bucket object path
// (schema_step27.sql), not a servable URL — this fetches a short-lived
// signed URL on mount (RLS-gated by the storage policies keyed off the
// ticket, so this naturally 403s for anyone who can't already see the
// message) and renders an inline preview for images, or a download chip
// for anything else.
function AttachmentBubble({
  supabase,
  path,
  name,
  mime,
  size,
  mine,
}: {
  supabase: ReturnType<typeof createClient>;
  path: string;
  name: string | null;
  mime: string | null;
  size: number | null;
  mine: boolean;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.storage
      .from("chat-attachments")
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setFailed(true);
          return;
        }
        setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (failed) {
    return (
      <p className="mb-1.5 text-xs text-red-400">
        Couldn't load attachment{name ? ` "${name}"` : ""}.
      </p>
    );
  }

  if (isImageMime(mime)) {
    return (
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-1.5 block overflow-hidden rounded-lg border border-hairline/50"
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={name ?? "Attached photo"} className="max-h-64 w-full object-cover" />
        ) : (
          <div className="flex h-32 w-48 items-center justify-center bg-surface-2 text-xs text-slate-500">
            Loading…
          </div>
        )}
      </a>
    );
  }

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={`mb-1.5 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
        mine ? "border-blue-400/30 bg-blue-500/10" : "border-hairline bg-surface"
      }`}
    >
      <FileIcon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{name ?? "Attachment"}</span>
      <span className="shrink-0 text-slate-500">{formatFileSize(size)}</span>
      <DownloadIcon className="h-4 w-4 shrink-0" />
    </a>
  );
}
