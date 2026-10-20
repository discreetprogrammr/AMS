"use client";

// All UI sounds are synthesized with the Web Audio API (a few oscillator
// beeps) rather than shipped as audio files — zero new dependencies, zero
// asset weight, and nothing to license. Covers: a short "pop" when you
// send a message, a repeating chime for an incoming call, and a
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

// A chime note: a quick attack and a long exponential fade, like a struck
// bell, so each note rings out instead of cutting off like beep() does.
function chime(freq: number, startAt: number, duration: number, volume: number) {
  const c = getContext();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, startAt);
  gain.gain.linearRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0008, startAt + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

// Peak volume of the incoming-call chime (0 to 1). The previous two-beep
// ring peaked at 0.18; this is a little louder because engineers are often
// away from the screen. Raise or lower it here.
const RING_VOLUME = 0.21;
const RING_REPEAT_MS = 2600;

// Rising three-note chime (E5, G5, C6), each note with a quiet octave above
// it for brightness. Friendlier than the old harsh beeps over a long shift,
// but still hard to ignore.
function playRingPulse() {
  const c = getContext();
  if (!c) return;
  const now = c.currentTime;
  const notes: [number, number][] = [
    [659.25, 0],
    [783.99, 0.18],
    [1046.5, 0.36],
  ];
  for (const [freq, delay] of notes) {
    chime(freq, now + delay, 1.1, RING_VOLUME);
    chime(freq * 2, now + delay, 0.7, RING_VOLUME * 0.23);
  }
}

// Incoming-call ring — repeats until stopped (accept/decline/caller
// hangs up/times out). Safe to call while already running. The chime is
// about 1.5 seconds long, so it repeats every RING_REPEAT_MS.
export function startRingtone() {
  if (ringtoneTimer) return;
  const c = getContext();
  if (c?.state === "suspended") c.resume().catch(() => {});
  playRingPulse();
  ringtoneTimer = setInterval(playRingPulse, RING_REPEAT_MS);
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
