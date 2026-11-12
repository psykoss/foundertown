/**
 * The calendar page (sidebar → Calendar) and the meeting dialog.
 * Left: invite card, search, your scheduled meetings / meeting notes, and a small card of the town
 * (minimap + the bottom bar) — the town keeps running under the page. Right: the week, hour by hour.
 * Date math, overlap layout and reminders are in `@ft/shared` (calendar.ts); meetings are in the store.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Link as LinkIcon, MapPin, NotebookPen, Plus, Search, UserPlus, X } from "lucide-react";
import { MAIN_LOBBY, MEETING_NOTES_MAX, MEETING_TITLE_MAX, MINUTE_MS, addDays, layoutDay, sameDay, startOfDay, weekDays, type Meeting } from "@ft/shared";
import { lobbyUrl } from "../net/room";
import { deleteMeeting, openMeeting, saveMeeting } from "../state/calendar";
import { store, useStore } from "../state/store";
import { BottomBar, Minimap } from "./Shell";

/** Height of one hour in the week grid (CSS px, before the UI scale). */
const HOUR_PX = 72;
const MIN_PX = HOUR_PX / 60;
/** Blocks lower than this show the title and the time on one line. */
const ONE_LINE_PX = 40;
/** New meetings made by clicking the grid start on this step. */
const SNAP_MIN = 30;

const pad = (n: number) => String(n).padStart(2, "0");
const timeOf = (t: number, hour12: boolean) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", hour12 }).format(t);
const rangeOf = (m: Meeting, hour12: boolean) => `${timeOf(m.start, hour12)} – ${timeOf(m.end, hour12)}`;
const weekdayOf = (d: Date) => new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(d);

/** "November 2026", or "Nov – Dec 2026" when the week crosses a month. */
function weekTitle(days: Date[]): string {
  const [a, b] = [days[0]!, days[6]!];
  const long = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
  if (a.getMonth() === b.getMonth()) return long.format(a);
  const short = (d: Date, year: boolean) => new Intl.DateTimeFormat(undefined, year ? { month: "short", year: "numeric" } : { month: "short" }).format(d);
  return `${short(a, a.getFullYear() !== b.getFullYear())} – ${short(b, true)}`;
}

/** "Today", "Tomorrow", or "Fri, Nov 13". */
function dayTitle(t: number, now: number): string {
  if (sameDay(t, now)) return "Today";
  if (sameDay(t, addDays(now, 1))) return "Tomorrow";
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : "numeric" }).format(t);
}

/** The next half hour from now. */
function nextSlot(): number {
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d.getTime();
}

/** The current time, refreshed twice a minute. */
function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ── left panel ─────────────────────────────────────────────────────────────────

function InviteCard() {
  const lobby = useStore((s) => (s.net.lobby === MAIN_LOBBY ? s.myLobby : s.net.lobby));
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(lobbyUrl(lobby));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      store.set({ modal: "invite" }); // the dialog shows the link to copy by hand
    }
  };
  return (
    <div className="cal-invite">
      <b>Founder Town is better together</b>
      <span>Invite founders to your lobby.</span>
      <div className="cal-invite-row">
        <button className="btn primary grow" onClick={() => store.set({ modal: "invite" })}><UserPlus size={18} strokeWidth={2} /> Invite</button>
        <button className="btn primary" aria-label={copied ? "Link copied" : "Copy invite link"} title={copied ? "Link copied" : "Copy invite link"} onClick={() => void copy()}>
          {copied ? <Check size={18} /> : <LinkIcon size={18} />}
        </button>
      </div>
    </div>
  );
}

/** Scheduled meetings (from now on) or the ones with notes; the search looks through all of them. */
function MeetingList({ now, onShow }: { now: number; onShow: (m: Meeting) => void }) {
  const meetings = useStore((s) => s.meetings);
  const hour12 = useStore((s) => s.settings.hour12);
  const [tab, setTab] = useState<"scheduled" | "notes">("scheduled");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const hit = (m: Meeting) => !q || m.title.toLowerCase().includes(q) || m.notes.toLowerCase().includes(q);
    if (tab === "notes") return meetings.filter((m) => m.notes && hit(m)).reverse();
    return meetings.filter((m) => (q ? hit(m) : m.end > now));
  }, [meetings, tab, q, now]);

  return (
    <>
      <label className="cal-search">
        <Search size={16} />
        <input value={query} placeholder="Search events" aria-label="Search events" onChange={(e) => setQuery(e.target.value)} />
        {query && <button className="icon-btn plain" aria-label="Clear search" onClick={() => setQuery("")}><X size={14} /></button>}
      </label>
      <div className="cal-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "scheduled"} className={tab === "scheduled" ? "on" : ""} onClick={() => setTab("scheduled")}>Scheduled</button>
        <button role="tab" aria-selected={tab === "notes"} className={tab === "notes" ? "on" : ""} onClick={() => setTab("notes")}>Meeting Notes</button>
      </div>
      <div className="cal-list" role="tabpanel">
        {shown.length === 0 && (
          <div className="cal-empty">
            {tab === "notes" ? <NotebookPen size={28} strokeWidth={1.5} /> : <CalendarDays size={28} strokeWidth={1.5} />}
            <span>{q ? "Nothing matches that search." : tab === "notes" ? "Notes you add to a meeting show up here." : "Nothing scheduled yet."}</span>
          </div>
        )}
        {shown.map((m, i) => (
          <div key={m.id} className="cal-entry">
            {(i === 0 || !sameDay(shown[i - 1]!.start, m.start)) && <div className="cal-date">{dayTitle(m.start, now)}</div>}
            <button className={"cal-item" + (m.end <= now ? " past" : "")} onClick={() => onShow(m)}>
              <b>{m.title}</b>
              <span>{rangeOf(m, hour12)}</span>
              {tab === "notes" && <p>{m.notes}</p>}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

/** The town, small: where you are, the floor plan and your controls. Clicking the plan goes back to the town. */
function TownCard() {
  const zone = useStore((s) => s.hud.zone);
  const title = useStore((s) => s.net.title);
  const back = () => store.set({ view: "map" });
  return (
    <div className="cal-town">
      <div className="cal-town-head"><MapPin size={15} /> <span>{zone ? zone.replace(/_/g, " ") : title || "Founder Town"}</span></div>
      <Minimap onPick={back} />
      <BottomBar />
    </div>
  );
}

// ── week grid ──────────────────────────────────────────────────────────────────

function HourLabel({ hour, hour12 }: { hour: number; hour12: boolean }) {
  return (
    <span className="cal-hour" style={{ top: hour * HOUR_PX }}>
      {hour12 ? <>{hour % 12 || 12} <small>{hour < 12 ? "AM" : "PM"}</small></> : `${pad(hour)}:00`}
    </span>
  );
}

function Week({ days, now }: { days: Date[]; now: number }) {
  const meetings = useStore((s) => s.meetings);
  const hour12 = useStore((s) => s.settings.hour12);
  const scroller = useRef<HTMLDivElement>(null);
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();

  // Open on the working day: an hour and a half before now.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, nowMin - 90) * MIN_PX;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Click on empty grid: a new meeting at that time, snapped to the half hour. */
  const create = (day: Date, e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const box = e.currentTarget.getBoundingClientRect();
    const minutes = Math.min(1440 - SNAP_MIN, Math.max(0, Math.floor((((e.clientY - box.top) / box.height) * 1440) / SNAP_MIN) * SNAP_MIN));
    const start = new Date(day);
    start.setHours(0, minutes, 0, 0);
    openMeeting({ start: start.getTime() });
  };

  return (
    <div className="cal-scroll" ref={scroller}>
      <div className="cal-days">
        <span />
        {days.map((d) => (
          <div key={d.getTime()} className={"cal-day" + (sameDay(d, now) ? " today" : "")}>
            {weekdayOf(d)} <b>{d.getDate()}</b>
          </div>
        ))}
      </div>
      <div className="cal-grid" style={{ height: 24 * HOUR_PX }}>
        <div className="cal-gutter">
          {Array.from({ length: 23 }, (_, i) => <HourLabel key={i} hour={i + 1} hour12={hour12} />)}
        </div>
        {Array.from({ length: 23 }, (_, i) => <i key={i} className="cal-line" style={{ top: (i + 1) * HOUR_PX }} />)}
        {days.map((d) => (
          <div key={d.getTime()} className="cal-col" onClick={(e) => create(d, e)}>
            {layoutDay(meetings, d).map((b) => (
              <button
                key={b.meeting.id}
                className={"cal-block" + (b.meeting.end <= now ? " past" : "") + ((b.to - b.from) * MIN_PX < ONE_LINE_PX ? " short" : "")}
                style={{ top: b.from * MIN_PX, height: (b.to - b.from) * MIN_PX, left: `${(b.lane / b.lanes) * 100}%`, width: `calc(${100 / b.lanes}% - 6px)` }}
                title={`${b.meeting.title} · ${rangeOf(b.meeting, hour12)}`}
                onClick={() => openMeeting({ id: b.meeting.id })}
              >
                <b>{b.meeting.title}</b>
                <span>{rangeOf(b.meeting, hour12)}</span>
              </button>
            ))}
            {sameDay(d, now) && (
              <div className="cal-now" style={{ top: nowMin * MIN_PX }}>
                <span>{timeOf(now, hour12)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarView() {
  const weekStart = useStore((s) => s.settings.weekStart);
  const now = useNow();
  /** Any moment inside the week being shown. */
  const [anchor, setAnchor] = useState(Date.now);
  const days = useMemo(() => weekDays(anchor, weekStart), [anchor, weekStart]);
  const show = (m: Meeting) => {
    setAnchor(m.start);
    openMeeting({ id: m.id });
  };

  return (
    <div className="cal">
      <aside className="cal-side">
        <h1>Calendar</h1>
        <InviteCard />
        <MeetingList now={now} onShow={show} />
        <TownCard />
      </aside>

      <section className="cal-main" aria-label="Week">
        <header className="cal-bar">
          <button className="icon-btn plain" aria-label="Previous week" onClick={() => setAnchor(addDays(anchor, -7).getTime())}><ChevronLeft size={20} /></button>
          <button className="icon-btn plain" aria-label="Next week" onClick={() => setAnchor(addDays(anchor, 7).getTime())}><ChevronRight size={20} /></button>
          <button className="btn outline" onClick={() => setAnchor(Date.now())}>Today</button>
          <h2>{weekTitle(days)}</h2>
          <button className="btn primary" onClick={() => openMeeting({ start: nextSlot() })}><Plus size={18} strokeWidth={2} /> New Meeting</button>
        </header>
        <Week days={days} now={now} />
      </section>
    </div>
  );
}

// ── meeting dialog ─────────────────────────────────────────────────────────────

const dateValue = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const timeValue = (t: number) => `${pad(new Date(t).getHours())}:${pad(new Date(t).getMinutes())}`;
/** Local date + clock time → epoch ms (NaN while a field is incomplete). */
function parse(date: string, time: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return new Date(y!, mo! - 1, d!, h!, mi!).getTime();
}

export function MeetingDialog() {
  // The subject is read once: the dialog keeps its content while it animates out.
  const [subject] = useState(() => store.get().meetingEdit);
  const [existing] = useState(() => (subject && "id" in subject ? store.get().meetings.find((m) => m.id === subject.id) : undefined));
  const [initial] = useState(() => {
    if (existing) return existing;
    const start = subject && "start" in subject ? subject.start : nextSlot();
    return { title: "", start, end: start + store.get().settings.meetingMinutes * MINUTE_MS, notes: "" };
  });

  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(dateValue(initial.start));
  const [from, setFrom] = useState(timeValue(initial.start));
  const [to, setTo] = useState(timeValue(initial.end));
  const [notes, setNotes] = useState(initial.notes);

  const close = () => store.set({ modal: null, meetingEdit: null });
  const start = parse(date, from);
  // An end at or before the start means the meeting runs past midnight.
  const sameDayEnd = parse(date, to);
  const end = sameDayEnd > start ? sameDayEnd : addDays(startOfDay(start), 1).getTime() + (sameDayEnd - startOfDay(start).getTime());
  const valid = title.trim().length > 0 && Number.isFinite(start) && Number.isFinite(end) && end > start;

  /** Moving the start keeps the length. */
  const changeFrom = (value: string) => {
    const length = end - start;
    setFrom(value);
    const next = parse(date, value);
    if (Number.isFinite(next) && Number.isFinite(length)) setTo(timeValue(next + length));
  };

  const save = () => {
    if (!valid) return;
    saveMeeting({ id: existing?.id, title, start, end, notes });
    close();
  };
  const remove = () => {
    if (existing) deleteMeeting(existing.id);
    close();
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <form className="dialog meeting" role="dialog" aria-label={existing ? "Edit meeting" : "New meeting"} onSubmit={(e) => (e.preventDefault(), save())}>
        <header className="dialog-head">
          <h2>{existing ? "Edit meeting" : "New meeting"}</h2>
          <button type="button" className="icon-btn plain" aria-label="Close" onClick={close}><X size={20} /></button>
        </header>
        <div className="dialog-body">
          <label className="field first">
            <span>Title<b>*</b></span>
            <input value={title} maxLength={MEETING_TITLE_MAX} autoFocus={!existing} placeholder="What is it about?" onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="field-pair">
            <label className="field">
              <span>Starts</span>
              <input type="time" value={from} required onChange={(e) => changeFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>Ends {sameDayEnd <= start && Number.isFinite(end) && <em>next day</em>}</span>
              <input type="time" value={to} required onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>
          <label className="field">
            <span>Notes <em>Optional</em></span>
            <textarea value={notes} maxLength={MEETING_NOTES_MAX} rows={4} placeholder="Agenda, links, what was decided…" onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <footer className="dialog-foot">
          {existing && <button type="button" className="btn outline danger-text" onClick={remove}>Delete</button>}
          <span className="foot-gap" />
          <button type="submit" className="btn primary" disabled={!valid}>Save</button>
        </footer>
      </form>
    </div>
  );
}
