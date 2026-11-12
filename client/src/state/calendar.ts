/**
 * Meetings and preferences: the actions the UI calls, and the reminder clock.
 * Both live in the store and are saved on this device (see `store.ts`); nothing here is shared with other players.
 */
import { MEETING_NOTES_MAX, MEETING_TITLE_MAX, MINUTE_MS, dueReminders, type Meeting } from "@ft/shared";
import { store, type Settings } from "./store";

export const updateSettings = (patch: Partial<Settings>) => store.set((s) => ({ settings: { ...s.settings, ...patch } }));

/** Add a meeting, or replace the one with the same id. */
export function saveMeeting(m: Omit<Meeting, "id"> & { id?: string }) {
  const meeting: Meeting = {
    id: m.id ?? crypto.randomUUID(),
    title: m.title.trim().slice(0, MEETING_TITLE_MAX) || "Meeting",
    start: m.start,
    end: m.end,
    notes: m.notes.trim().slice(0, MEETING_NOTES_MAX),
  };
  store.set((s) => ({ meetings: [...s.meetings.filter((o) => o.id !== meeting.id), meeting].sort((a, b) => a.start - b.start) }));
}

export const deleteMeeting = (id: string) => store.set((s) => ({ meetings: s.meetings.filter((m) => m.id !== id) }));

/** Open the meeting dialog on an existing meeting, or on a new one starting at `start`. */
export const openMeeting = (subject: { id: string } | { start: number }) => store.set({ modal: "meeting", meetingEdit: subject, popover: null });

/** Two soft notes. Browsers only play it once you have interacted with the page. */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const at = ctx.currentTime + i * 0.17;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.5);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* no audio output */
  }
}

const CHECK_MS = 5000;
/** A tab that slept does not replay reminders older than this. */
const STALE_MS = 2 * MINUTE_MS;

/** Say when a meeting is 5 minutes away and when it starts (the notice line, plus a sound), as the settings ask. */
export function startReminders() {
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const { meetings, settings } = store.get();
    const due = dueReminders(meetings, Math.max(last, now - STALE_MS), now, { soon: settings.remindSoon, now: settings.remindStart });
    last = now;
    const r = due.at(-1);
    if (!r) return;
    store.set({ notice: r.kind === "now" ? `“${r.meeting.title}” is starting now.` : `“${r.meeting.title}” starts in 5 minutes.` });
    if (settings.remindSound) chime();
  }, CHECK_MS);
}
