/**
 * Calendar logic: meetings, the week being shown, where each meeting sits in a day column and
 * which reminders are due. Pure — times are epoch milliseconds, days are in the local time zone.
 */
export interface Meeting {
  id: string;
  title: string;
  /** Epoch ms; `end` is after `start`. */
  start: number;
  end: number;
  notes: string;
}

export const MEETING_TITLE_MAX = 60;
export const MEETING_NOTES_MAX = 2000;
export const MINUTE_MS = 60_000;
/** Reminder lead time ("starts in 5 minutes"). */
export const REMIND_LEAD_MS = 5 * MINUTE_MS;

/** Meetings from storage: only well-formed ones, sorted by start. */
export function sanitizeMeetings(raw: unknown): Meeting[] {
  if (!Array.isArray(raw)) return [];
  const out: Meeting[] = [];
  for (const m of raw as Partial<Meeting>[]) {
    if (!m || typeof m.id !== "string" || typeof m.title !== "string") continue;
    if (!Number.isFinite(m.start) || !Number.isFinite(m.end) || m.end! <= m.start!) continue;
    const notes = typeof m.notes === "string" ? m.notes.slice(0, MEETING_NOTES_MAX) : "";
    out.push({ id: m.id, title: m.title.trim().slice(0, MEETING_TITLE_MAX) || "Meeting", start: m.start!, end: m.end!, notes });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Local midnight of that day. */
export function startOfDay(t: number | Date): Date {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** The same clock time `n` days later (calendar days, so it is right across a clock change). */
export function addDays(t: number | Date, n: number): Date {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d;
}

/** Midnight of the first day of the week containing `t`; `firstDay` 0 = Sunday, 1 = Monday. */
export function startOfWeek(t: number | Date, firstDay: 0 | 1): Date {
  const d = startOfDay(t);
  return addDays(d, -((d.getDay() - firstDay + 7) % 7));
}

/** The seven days (midnights) of the week containing `t`. */
export function weekDays(t: number | Date, firstDay: 0 | 1): Date[] {
  const first = startOfWeek(t, firstDay);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** The six weeks (42 midnights) a month grid shows for the month containing `t`. */
export function monthDays(t: number | Date, firstDay: 0 | 1): Date[] {
  const d = startOfDay(t);
  d.setDate(1);
  const first = startOfWeek(d, firstDay);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export const sameDay = (a: number | Date, b: number | Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** A meeting placed in one day column: minutes from midnight, and its lane among overlapping meetings. */
export interface DayBlock {
  meeting: Meeting;
  /** Minutes from the day's midnight to the top and the bottom of the block (0–1440). */
  from: number;
  to: number;
  /** Lane index, and how many lanes its group of overlapping meetings needs. */
  lane: number;
  lanes: number;
}

/** Blocks shorter than this are drawn this tall, so their title stays readable and clickable. */
export const MIN_BLOCK_MIN = 20;

/** Lay out the meetings that touch `day`: clipped to the day, overlapping ones side by side. */
export function layoutDay(meetings: Meeting[], day: number | Date): DayBlock[] {
  const start = startOfDay(day).getTime();
  const end = addDays(start, 1).getTime();
  const minutes = (t: number) => {
    if (t <= start) return 0;
    if (t >= end) return 1440;
    const d = new Date(t);
    return d.getHours() * 60 + d.getMinutes();
  };
  const blocks: DayBlock[] = meetings
    .filter((m) => m.start < end && m.end > start)
    .sort((a, b) => a.start - b.start || b.end - a.end)
    .map((meeting) => {
      const from = Math.min(minutes(meeting.start), 1440 - MIN_BLOCK_MIN);
      return { meeting, from, to: Math.max(minutes(meeting.end), from + MIN_BLOCK_MIN), lane: 0, lanes: 1 };
    });

  // Sweep: a group is a run of blocks that overlap (directly or through others); each block takes the first free lane.
  let group: DayBlock[] = [];
  let groupEnd = -1;
  const close = () => {
    const lanes = Math.max(0, ...group.map((b) => b.lane)) + 1;
    for (const b of group) b.lanes = lanes;
    group = [];
  };
  for (const b of blocks) {
    if (group.length && b.from >= groupEnd) close();
    const taken = new Set(group.filter((o) => o.to > b.from).map((o) => o.lane));
    while (taken.has(b.lane)) b.lane++;
    group.push(b);
    groupEnd = Math.max(groupEnd, b.to);
  }
  if (group.length) close();
  return blocks;
}

export interface Reminder {
  meeting: Meeting;
  kind: "soon" | "now";
}

/** Reminders that came due in the interval (`after`, `until`]: 5 minutes before a meeting, and at its start. */
export function dueReminders(meetings: Meeting[], after: number, until: number, want: { soon: boolean; now: boolean }): Reminder[] {
  const due = (t: number) => t > after && t <= until;
  const out: Reminder[] = [];
  for (const meeting of meetings) {
    if (want.now && due(meeting.start)) out.push({ meeting, kind: "now" });
    else if (want.soon && due(meeting.start - REMIND_LEAD_MS)) out.push({ meeting, kind: "soon" });
  }
  return out;
}
