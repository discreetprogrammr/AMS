"use client";

// All UI sounds are synthesized with the Web Audio API (a few oscillator
// beeps) rather than shipped as audio files — zero new dependencies, zero
// asset weight, and nothing to license. Covers: a short "pop" when you
// send a message, a repeating ringtone for an incoming call, and a
// repeating ringback tone for the caller while waiting for an answer.

let ctx: AudioContext | null = null;
let unlocked = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

// Mobile (and most desktop) browsers refuse to play ANY audio — including
// one triggered programmatically by an incoming-call event — until the
// page has seen at least one real user gesture (tap/click/keypress).
// Call this once when the Messages UI mounts so that by the time a call
// actually comes in, the AudioContext is already unlocked instead of
// silently doing nothing on the first ring.
export function unlockAudioOnFirstInteraction() {
  if (unlocked || typeof window === "undefined") return;
  const events = ["pointerdown", "touchstart", "keydown", "click"] as const;
  const unlock = () => {
    const c = getContext();
    if (c?.state === "suspended") c.resume().catch(() => {});
    unlocked = true;
    events.forEach((evt) => window.removeEventListener(evt, unlock));
  };
  events.forEach((evt) => window.addEventListener(evt, unlock));
}

function beep(freq: number, startAt: number, duration: number, volume = 0.15) {
  const c = getContext();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.linearRampToValueAtTime(0, startAt + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

// Short two-note "pop" — plays right after you send a chat message.
export function playSentTone() {
  const c = getContext();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  beep(880, now, 0.06, 0.12);
  beep(1320, now + 0.07, 0.08, 0.12);
}

// Short two-note "pop" — plays when a message arrives FROM someone else.
// Deliberately the mirror image of playSentTone (falling instead of
// rising) so sent vs. received are distinguishable by ear, not just by
// bubble alignment.
export function playReceivedTone() {
  const c = getContext();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  beep(720, now, 0.07, 0.13);
  beep(540, now + 0.08, 0.09, 0.13);
}

let ringtoneTimer: ReturnType<typeof setInterval> | null = null;
let ringbackTimer: ReturnType<typeof setInterval> | null = null;

function playRingPulse() {
  const c = getContext();
  if (!c) return;
  const now = c.currentTime;
  // Classic two-tone "ring-ring" pulse, twice per cycle.
  beep(480, now, 0.35, 0.18);
  beep(620, now, 0.35, 0.14);
  beep(480, now + 0.45, 0.35, 0.18);
  beep(620, now + 0.45, 0.35, 0.14);
}

// Incoming-call ring — repeats until stopped (accept/decline/caller
// hangs up/times out). Safe to call while already running.
export function startRingtone() {
  if (ringtoneTimer) return;
  const c = getContext();
  if (c?.state === "suspended") c.resume().catch(() => {});
  playRingPulse();
  ringtoneTimer = setInterval(playRingPulse, 2000);
}

export function stopRingtone() {
  if (ringtoneTimer) {
    clearInterval(ringtoneTimer);
    ringtoneTimer = null;
  }
}

function playRingbackPulse() {
  const c = getContext();
  if (!c) return;
  beep(425, c.currentTime, 1.0, 0.1);
}

// Outgoing "ringback" — what the caller hears while waiting for the
// other side to pick up.
export function startRingback() {
  if (ringbackTimer) return;
  const c = getContext();
  if (c?.state === "suspended") c.resume().catch(() => {});
  playRingbackPulse();
  ringbackTimer = setInterval(playRingbackPulse, 3000);
}

export function stopRingback() {
  if (ringbackTimer) {
    clearInterval(ringbackTimer);
    ringbackTimer = null;
  }
}
