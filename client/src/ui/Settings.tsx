/**
 * Settings dialog (sidebar gear, logo menu): sections on the left, the chosen one on the right.
 * Every control is live — it edits `store.settings` (kept on this device), store flags, or calls a
 * net action. Sections exist only for things that are built.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Bell, CalendarDays, Check, ChevronDown, Copy, DoorOpen, Mic, Settings as SettingsIcon, UserRound, Video, Wrench, X } from "lucide-react";
import { MAIN_LOBBY } from "@ft/shared";
import { joinLobby, lobbyUrl } from "../net/room";
import { authEnabled, signOut } from "../net/session";
import { listDevices } from "../net/voice";
import { updateSettings } from "../state/calendar";
import { store, useStore, type DebugFlags, type Modal, type Settings } from "../state/store";
import { ProfilePic } from "./Shell";

type Tab = "general" | "calendar" | "audio" | "video" | "notifications" | "advanced" | "lobby" | "account";
const NAV: { label: string; items: { id: Tab; label: string; icon: ReactNode }[] }[] = [
  {
    label: "Preferences",
    items: [
      { id: "general", label: "General", icon: <SettingsIcon size={18} strokeWidth={1.75} /> },
      { id: "calendar", label: "Calendar", icon: <CalendarDays size={18} strokeWidth={1.75} /> },
      { id: "audio", label: "Audio", icon: <Mic size={18} strokeWidth={1.75} /> },
      { id: "video", label: "Video", icon: <Video size={18} strokeWidth={1.75} /> },
      { id: "notifications", label: "Notifications", icon: <Bell size={18} strokeWidth={1.75} /> },
      { id: "advanced", label: "Advanced", icon: <Wrench size={18} strokeWidth={1.75} /> },
    ],
  },
  {
    label: "Town",
    items: [
      { id: "lobby", label: "Lobby", icon: <DoorOpen size={18} strokeWidth={1.75} /> },
      { id: "account", label: "Account", icon: <UserRound size={18} strokeWidth={1.75} /> },
    ],
  },
];

// ── controls ───────────────────────────────────────────────────────────────────

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="set-section">
      <h3>{title}</h3>
      {lead && <p className="set-lead">{lead}</p>}
      {children}
    </section>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="set-row">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={"switch" + (on ? " on" : "")} onClick={() => onChange(!on)}><i /></button>
    </div>
  );
}

function Radios<T extends string | number>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="radios">
      <legend>{label}{hint && <small>{hint}</small>}</legend>
      {options.map((o) => (
        <label key={String(o.value)}>
          <input type="radio" checked={o.value === value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

/** A setting bound to `store.settings`. */
function useSetting<K extends keyof Settings>(key: K): [Settings[K], (v: Settings[K]) => void] {
  const value = useStore((s) => s.settings[key]);
  return [value, (v) => updateSettings({ [key]: v } as Pick<Settings, K>)];
}

/** Microphone or camera picker. Browsers list (and name) devices only after the device was allowed once. */
function DevicePicker({ kind, label }: { kind: "audio" | "video"; label: string }) {
  const [id, setId] = useSetting(kind === "audio" ? "micId" : "camId");
  const live = useStore((s) => (kind === "audio" ? s.mic : s.cam));
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void listDevices(kind).then((d) => alive && setDevices(d));
    load();
    navigator.mediaDevices?.addEventListener?.("devicechange", load);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", load);
    };
  }, [kind, live]);
  const known = !id || devices.some((d) => d.id === id);
  return (
    <label className="field first">
      <span>{label}</span>
      <div className="select">
        <select value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">System default</option>
          {!known && <option value={id}>Saved device (not connected)</option>}
          {devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <ChevronDown size={18} />
      </div>
      {devices.length === 0 && <small className="set-note">Turn your {kind === "audio" ? "microphone" : "camera"} on once and your devices are listed here.</small>}
    </label>
  );
}

// ── sections ───────────────────────────────────────────────────────────────────

function General() {
  const name = useStore((s) => s.playerName);
  const timeZone = useStore((s) => s.timeZone);
  const [hour12, setHour12] = useSetting("hour12");
  const open = (modal: Modal) => store.set({ modal });
  return (
    <>
      <Section title="Profile">
        <div className="set-profile">
          <ProfilePic size={48} />
          <span><b>{name}</b><small>{timeZone.replace(/_/g, " ")}</small></span>
        </div>
        <div className="set-actions">
          <button className="btn outline" onClick={() => open("editProfile")}>Edit profile</button>
          <button className="btn outline" onClick={() => store.set({ modal: "editAvatar", avatarReturn: "settings" })}>Edit avatar</button>
          <button className="btn outline" onClick={() => open("founder")}>Founder profile</button>
        </div>
      </Section>
      <Section title="Time">
        <Radios label="Time format" hint="Used by your clock and the calendar" value={hour12 ? "12" : "24"} options={[{ value: "12", label: "12-hour (1:30 PM)" }, { value: "24", label: "24-hour (13:30)" }]} onChange={(v) => setHour12(v === "12")} />
      </Section>
    </>
  );
}

function CalendarPrefs() {
  const [weekStart, setWeekStart] = useSetting("weekStart");
  const [minutes, setMinutes] = useSetting("meetingMinutes");
  return (
    <>
      <Section title="Week">
        <Radios label="Week starts on" value={weekStart} options={[{ value: 0, label: "Sunday" }, { value: 1, label: "Monday" }]} onChange={setWeekStart} />
      </Section>
      <Section title="New meetings">
        <Radios label="Default length" value={minutes} options={[{ value: 30, label: "30 minutes" }, { value: 60, label: "1 hour" }]} onChange={setMinutes} />
      </Section>
    </>
  );
}

function Audio() {
  const [noise, setNoise] = useSetting("noiseSuppression");
  const [volume, setVolume] = useSetting("volume");
  return (
    <>
      <Section title="Microphone">
        <DevicePicker kind="audio" label="Input device" />
        <Toggle label="Noise suppression" hint="Filters out keyboard and background noise" on={noise} onChange={setNoise} />
      </Section>
      <Section title="Other people">
        <label className="set-range">
          <span>Voice volume <b>{Math.round(volume * 100)}%</b></span>
          <input type="range" min={0} max={100} step={5} value={Math.round(volume * 100)} onChange={(e) => setVolume(Number(e.target.value) / 100)} />
        </label>
        <p className="set-note">Nearby voices still fade with distance; this sets how loud they are at most.</p>
      </Section>
    </>
  );
}

function VideoPrefs() {
  const [mirror, setMirror] = useSetting("mirror");
  return (
    <Section title="Camera">
      <DevicePicker kind="video" label="Camera" />
      <Toggle label="Mirror my video" hint="Only changes how you see yourself" on={mirror} onChange={setMirror} />
    </Section>
  );
}

function Notifications() {
  const [soon, setSoon] = useSetting("remindSoon");
  const [start, setStart] = useSetting("remindStart");
  const [sound, setSound] = useSetting("remindSound");
  return (
    <Section title="Calendar events" lead="Reminders show while Founder Town is open in a tab.">
      <Toggle label="Show reminder 5 minutes before calendar event" on={soon} onChange={setSoon} />
      <Toggle label="Show reminder at start of calendar event" on={start} onChange={setStart} />
      <Toggle label="Play a sound for calendar event reminders" on={sound} onChange={setSound} />
    </Section>
  );
}

function Advanced() {
  const debug = useStore((s) => s.debug);
  const flip = (k: keyof DebugFlags) => store.set({ debug: { ...debug, [k]: !debug[k] } });
  return (
    <Section title="Debug overlays" lead="Drawn over the town. Also on F1, F2 and F3.">
      <Toggle label="Tile grid" on={debug.grid} onChange={() => flip("grid")} />
      <Toggle label="Collision" on={debug.collision} onChange={() => flip("collision")} />
      <Toggle label="Depth order" on={debug.depth} onChange={() => flip("depth")} />
    </Section>
  );
}

function Lobby() {
  const net = useStore((s) => s.net);
  const myLobby = useStore((s) => s.myLobby);
  const [copied, setCopied] = useState(false);
  const link = lobbyUrl(myLobby);
  const go = (lobby: string) => {
    store.set({ modal: null, view: "map" });
    void joinLobby(lobby);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is selectable in the field */
    }
  };
  return (
    <>
      <Section title="You are in">
        <div className="set-row">
          <span>{net.lobby === MAIN_LOBBY ? "Main lobby" : net.lobby === myLobby ? "Your lobby" : net.title || "A private lobby"}<small>{net.status === "online" ? "Connected" : net.status === "connecting" ? "Connecting…" : "Offline"}</small></span>
          {net.lobby !== MAIN_LOBBY && <button className="btn outline" onClick={() => go(MAIN_LOBBY)}>Go to main lobby</button>}
          {net.lobby !== myLobby && <button className="btn outline" onClick={() => go(myLobby)}>Go to my lobby</button>}
        </div>
      </Section>
      <Section title="Your lobby" lead="Anyone with this link can join your private lobby.">
        <div className="input-row">
          <input className="set-input" readOnly value={link} aria-label="Link to your lobby" onFocus={(e) => e.target.select()} />
          <button className="btn outline" onClick={() => void copy()}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}</button>
        </div>
        <div className="set-actions">
          <button className="btn primary" onClick={() => store.set({ modal: "invite" })}>Invite people</button>
        </div>
      </Section>
    </>
  );
}

function Account() {
  const email = useStore((s) => s.session.email);
  return (
    <Section title="Signed in as">
      <div className="set-row">
        <span>{authEnabled ? email ?? "Your account" : "Guest"}<small>{authEnabled ? "Your profile and avatar are saved to this account." : "Guest mode: everything is kept in this browser."}</small></span>
        {authEnabled && <button className="btn outline" onClick={() => void signOut()}>Sign out</button>}
      </div>
      <p className="set-note">Meetings and these settings are kept on this device.</p>
    </Section>
  );
}

const PANES: Record<Tab, () => ReactNode> = { general: General, calendar: CalendarPrefs, audio: Audio, video: VideoPrefs, notifications: Notifications, advanced: Advanced, lobby: Lobby, account: Account };

export function SettingsDialog() {
  const [tab, setTab] = useState<Tab>("general");
  const close = () => store.set({ modal: null });
  const Pane = PANES[tab];
  const title = NAV.flatMap((g) => g.items).find((i) => i.id === tab)!.label;
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog settings" role="dialog" aria-label="Settings">
        <nav className="set-nav" aria-label="Settings sections">
          {NAV.map((g) => (
            <div key={g.label} className="set-group">
              <div className="set-label">{g.label}</div>
              {g.items.map((i) => (
                <button key={i.id} className={"set-item" + (i.id === tab ? " on" : "")} aria-current={i.id === tab ? "page" : undefined} onClick={() => setTab(i.id)}>
                  {i.icon}
                  <span>{i.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="set-main">
          <header className="set-head">
            <h2>{title}</h2>
            <button className="icon-btn plain" aria-label="Close" onClick={close}><X size={20} /></button>
          </header>
          <div className="set-body" key={tab}><Pane /></div>
        </div>
      </div>
    </div>
  );
}
