"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

// crypto.randomUUID() only exists in "secure contexts" (HTTPS, or
// localhost) — it's undefined on Safari/Chrome mobile when the dev server
// is reached over plain http://<lan-ip>:3000, which throws "crypto
// .randomUUID is not a function". This works everywhere; it doesn't need
// to be cryptographically strong, just unique per call.
function makeCallId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "call-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export type CallKind = "audio" | "video";
export type CallStatus =
  | "idle"
  | "calling" // I'm the caller, waiting for them to answer
  | "ringing" // I'm the callee, someone is calling me
  | "connecting" // answer received/accepted, ICE still negotiating
  | "active"; // media flowing

export type IncomingCall = {
  callId: string;
  kind: CallKind;
  fromId: string;
  fromName: string;
  offer: RTCSessionDescriptionInit;
};

export type CallEvent = {
  type: "call_started" | "call_ended" | "call_missed" | "call_declined";
  kind: CallKind;
};

// The invite carries the offer SDP directly (rather than as two separate
// messages) specifically to avoid an "offer arrived before we'd finished
// processing the invite" race — one less thing to buffer/order.
type SignalMessage =
  | {
      type: "invite";
      callId: string;
      kind: CallKind;
      fromId: string;
      fromName: string;
      sdp: RTCSessionDescriptionInit;
    }
  | { type: "answer"; callId: string; fromId: string; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; callId: string; fromId: string; candidate: RTCIceCandidateInit }
  | { type: "decline"; callId: string; fromId: string }
  | { type: "hangup"; callId: string; fromId: string };

const RING_TIMEOUT_MS = 45_000;
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

// Drives a single WebRTC call (audio or video) scoped to one ticket.
// Signaling (offer/answer/ICE candidates/ringing/hangup) travels over a
// Supabase Realtime Broadcast channel named `call:${ticketId}` — ephemeral,
// nothing persisted. The actual audio/video never touches Supabase at all:
// it's a direct peer-to-peer (or TURN-relayed, see /api/turn-credentials)
// connection between the two browsers.
export function useCall({
  ticketId,
  userId,
  userName,
  onCallEvent,
}: {
  ticketId: string;
  userId: string;
  userName: string;
  onCallEvent: (event: CallEvent) => void;
}) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [kind, setKind] = useState<CallKind | null>(null);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusRef = useRef<CallStatus>("idle");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const callIdRef = useRef<string | null>(null);
  const kindRef = useRef<CallKind | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const startedFiredRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const supabase = useRef(createClient()).current;

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const send = useCallback((msg: SignalMessage) => {
    channelRef.current?.send({ type: "broadcast", event: "signal", payload: msg });
  }, []);

  const cleanupCall = useCallback(() => {
    pcRef.current?.getSenders().forEach((s) => s.track?.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    callIdRef.current = null;
    kindRef.current = null;
    pendingCandidatesRef.current = [];
    startedFiredRef.current = false;
    clearRingTimeout();
    setMuted(false);
    setCameraOff(false);
  }, [clearRingTimeout]);

  const handleSignal = useCallback(
    (msg: SignalMessage) => {
      switch (msg.type) {
        case "invite": {
          if (statusRef.current !== "idle") {
            // Already on a call (or one's already ringing) — auto-decline
            // rather than silently dropping it, so the caller doesn't just
            // hang waiting.
            send({ type: "decline", callId: msg.callId, fromId: userId });
            return;
          }
          setIncoming({
            callId: msg.callId,
            kind: msg.kind,
            fromId: msg.fromId,
            fromName: msg.fromName,
            offer: msg.sdp,
          });
          setStatus("ringing");
          break;
        }
        case "answer": {
          if (msg.callId !== callIdRef.current || !pcRef.current) return;
          pcRef.current
            .setRemoteDescription(new RTCSessionDescription(msg.sdp))
            .then(() => {
              pendingCandidatesRef.current.forEach((c) => {
                pcRef.current?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
              });
              pendingCandidatesRef.current = [];
            })
            .catch(() => setError("Couldn't connect the call."));
          clearRingTimeout();
          setStatus("connecting");
          break;
        }
        case "ice-candidate": {
          if (msg.callId !== callIdRef.current) return;
          if (pcRef.current?.remoteDescription) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else {
            pendingCandidatesRef.current.push(msg.candidate);
          }
          break;
        }
        case "decline": {
          if (msg.callId !== callIdRef.current) return;
          const k = kindRef.current ?? "audio";
          cleanupCall();
          setStatus("idle");
          onCallEvent({ type: "call_declined", kind: k });
          break;
        }
        case "hangup": {
          if (msg.callId !== callIdRef.current) return;
          const wasConnected = statusRef.current === "active";
          const k = kindRef.current ?? "audio";
          cleanupCall();
          setIncoming(null);
          setStatus("idle");
          if (wasConnected) onCallEvent({ type: "call_ended", kind: k });
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, send, cleanupCall, onCallEvent, clearRingTimeout],
  );

  useEffect(() => {
    const channel = supabase.channel(`call:${ticketId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on(
      "broadcast",
      { event: "signal" },
      ({ payload }: { payload: SignalMessage }) => handleSignal(payload),
    );

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, handleSignal]);

  async function getIceServers(): Promise<RTCIceServer[]> {
    try {
      const res = await fetch("/api/turn-credentials");
      if (!res.ok) return FALLBACK_ICE_SERVERS;
      const servers = await res.json();
      return Array.isArray(servers) && servers.length ? servers : FALLBACK_ICE_SERVERS;
    } catch {
      return FALLBACK_ICE_SERVERS;
    }
  }

  const createPeerConnection = useCallback(async () => {
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) {
        send({
          type: "ice-candidate",
          callId: callIdRef.current,
          fromId: userId,
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (e) => {
      setRemoteStream((prev) => {
        const stream = prev ?? new MediaStream();
        if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
        return stream;
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setStatus("active");
        if (!startedFiredRef.current) {
          startedFiredRef.current = true;
          onCallEvent({ type: "call_started", kind: kindRef.current ?? "audio" });
        }
      }
    };

    pcRef.current = pc;
    return pc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [send, userId, onCallEvent]);

  async function getLocalMedia(wantVideo: boolean): Promise<MediaStream> {
    // navigator.mediaDevices is only exposed in a "secure context" (HTTPS,
    // or localhost on the SAME device). A phone visiting the dev server at
    // http://<lan-ip>:3000 gets `mediaDevices` as undefined entirely — the
    // browser hides the API rather than throwing a permission error — so
    // this needs its own check instead of a confusing "reading
    // 'getUserMedia' of undefined" crash.
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera/microphone access requires HTTPS. This works on the deployed Vercel site, but not when testing over a plain http://<lan-ip> address from another device.",
      );
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: wantVideo ? { facingMode: "user" } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  const startCall = useCallback(
    async (callKind: CallKind) => {
      setError(null);
      const callId = makeCallId();
      callIdRef.current = callId;
      kindRef.current = callKind;
      setKind(callKind);
      setStatus("calling");

      try {
        const stream = await getLocalMedia(callKind === "video");
        const pc = await createPeerConnection();
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ type: "invite", callId, kind: callKind, fromId: userId, fromName: userName, sdp: offer });

        ringTimeoutRef.current = setTimeout(() => {
          if (statusRef.current === "calling") {
            send({ type: "hangup", callId, fromId: userId });
            cleanupCall();
            setStatus("idle");
            onCallEvent({ type: "call_missed", kind: callKind });
          }
        }, RING_TIMEOUT_MS);
      } catch (err) {
        // Surface the REAL browser error (permission denied vs. no device
        // vs. device already in use vs. getUserMedia unsupported in this
        // context, etc.) rather than a generic message — this is the only
        // way to tell those apart from a bug report.
        const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        // eslint-disable-next-line no-console
        console.error("[useCall] startCall failed:", err);
        setError(`Couldn't start the call — ${detail}`);
        cleanupCall();
        setStatus("idle");
      }
    },
    [userId, userName, send, createPeerConnection, cleanupCall, onCallEvent],
  );

  // Guards against a fast double-tap on the Accept button firing two
  // concurrent acceptCall() runs — each would create its own
  // RTCPeerConnection and stomp on the other's `pcRef.current`, breaking
  // the call and very plausibly ending in a stray "decline" being sent.
  const acceptingRef = useRef(false);

  const acceptCall = useCallback(async () => {
    if (!incoming || acceptingRef.current) return;
    acceptingRef.current = true;
    const { callId, kind: callKind, offer } = incoming;
    setError(null);
    callIdRef.current = callId;
    kindRef.current = callKind;
    setKind(callKind);
    setIncoming(null);
    setStatus("connecting");

    try {
      const stream = await getLocalMedia(callKind === "video");
      const pc = await createPeerConnection();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      pendingCandidatesRef.current.forEach((c) => {
        pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      });
      pendingCandidatesRef.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      send({ type: "answer", callId, fromId: userId, sdp: answer });
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      // eslint-disable-next-line no-console
      console.error("[useCall] acceptCall failed:", err);
      setError(`Couldn't join the call — ${detail}`);
      send({ type: "decline", callId, fromId: userId });
      cleanupCall();
      setStatus("idle");
    } finally {
      acceptingRef.current = false;
    }
  }, [incoming, userId, send, createPeerConnection, cleanupCall]);

  const declineCall = useCallback(() => {
    if (!incoming) return;
    send({ type: "decline", callId: incoming.callId, fromId: userId });
    onCallEvent({ type: "call_declined", kind: incoming.kind });
    setIncoming(null);
    setStatus("idle");
  }, [incoming, userId, send, onCallEvent]);

  const hangUp = useCallback(() => {
    const cid = callIdRef.current;
    const k = kindRef.current ?? "audio";
    const wasConnected = statusRef.current === "active" || statusRef.current === "connecting";
    if (cid) send({ type: "hangup", callId: cid, fromId: userId });
    cleanupCall();
    setStatus("idle");
    if (wasConnected) onCallEvent({ type: "call_ended", kind: k });
  }, [userId, send, cleanupCall, onCallEvent]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  }, []);

  // Clean up any live call if the component unmounts mid-call (e.g.
  // navigating away from the chat thread).
  useEffect(() => {
    return () => {
      if (callIdRef.current) {
        send({ type: "hangup", callId: callIdRef.current, fromId: userId });
      }
      pcRef.current?.getSenders().forEach((s) => s.track?.stop());
      pcRef.current?.close();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    kind,
    incoming,
    localStream,
    remoteStream,
    muted,
    cameraOff,
    error,
    startCall,
    acceptCall,
    declineCall,
    hangUp,
    toggleMute,
    toggleCamera,
  };
}
