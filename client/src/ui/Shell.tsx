/**
 * App chrome around the game frame: left sidebar, logo menu, bottom bar, map controls, profile card.
 * Everything here is UI only — it talks to the game through the store.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell, Calendar, ChevronDown, ChevronUp, CircleHelp, Clock, CreditCard, DoorOpen, Download, Ellipsis, EllipsisVertical,
  Gift, Hammer, House, LampDesk, LogOut, Map as MapIcon, MessagesSquare, Mic, MicOff, Minus, Navigation, PanelLeft, Pencil, Plus,
  Search, Settings, Smile, Sprout, SquareDashed, SquarePen, User, UserPlus, Video, VideoOff, X,
} from "lucide-react";
import { MAIN_LOBBY, STAGES, optionLabel } from "@ft/shared";
import { joinLobby } from "../net/room";
import { authEnabled, signOut } from "../net/session";
import { setCam, setMic } from "../net/voice";
import { store, useStore } from "../state/store";
import { GoalChips } from "./PixelIcon";

const ICON = { size: 20, strokeWidth: 1.75 } as const;

/**
 * Founder Town mark, as pixel art on a 16×16 grid: an isometric block — the first building of a
 * town — with a flag planted on its roof. One color; the faces are told apart by opacity
 * ("#" full: left wall, flag · "r" right wall · "t" roof), the doorway and the window are left empty.
 */
const LOGO_ART = [
  ".......####.....",
  ".......######...",
  ".......####.....",
  ".......#........",
  "......t#tt......",
  "....tttttttt....",
  "..tttttttttttt..",
  "..##ttttttttrr..",
  "..####ttttrrrr..",
  "..######rrrrrr..",
  "..##..##rr..rr..",
  "..##..##rr..rr..",
  "..##..##rrrrrr..",
  "....####rrrr....",
  "......##rr......",
  "................",
];
const LOGO_OPACITY: Record<string, number> = { "#": 1, r: 0.7, t: 0.42 };
/** One rect per horizontal run of the same shade. */
const LOGO_RECTS = LOGO_ART.flatMap((row, y) => {
  const out: { x: number; y: number; w: number; o: number }[] = [];
  for (let x = 0; x < row.length; ) {
    let end = x + 1;
    while (row[end] === row[x]) end++;
    const o = LOGO_OPACITY[row[x]!];
    if (o) out.push({ x, y, w: end - x, o });
    x = end;
  }
  return out;
});

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden>
      {LOGO_RECTS.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill="currentColor" fillOpacity={r.o} />)}
    </svg>
  );
}

/** Profile picture, or the name's initial on a colored circle. */
export function ProfilePic({ size, status = false }: { size: number; status?: boolean }) {
  const name = useStore((s) => s.playerName);
  const picture = useStore((s) => s.picture);
  return (
    <span className="pic" style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {picture ? <img src={picture} alt="" /> : (name.trim()[0] ?? "?").toUpperCase()}
      {status && <span className="pic-status" />}
    </span>
  );
}

function SideButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button className={"side-btn" + (active ? " active" : "")} title={label} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

export function Sidebar() {
  const menuOpen = useStore((s) => s.popover === "menu");
  return (
    <nav className="sidebar">
      <button
        className="logo-btn"
        aria-label="Founder Town menu"
        aria-expanded={menuOpen}
        onClick={() => store.set({ popover: menuOpen ? null : "menu" })}
      >
        <Logo />
        <span className="logo-caret">{menuOpen ? <ChevronUp size={12} strokeWidth={2.5} /> : <ChevronDown size={12} strokeWidth={2.5} />}</span>
      </button>

      <SideButton label="Search"><Search {...ICON} /></SideButton>
      <div className="kbd-hint"><kbd>⌘</kbd><kbd>K</kbd></div>
      <div className="side-sep" />

      <SideButton label="Map" active><MapIcon {...ICON} /></SideButton>
      <SideButton label="Chat"><MessagesSquare {...ICON} /></SideButton>
      <SideButton label="Calendar"><Calendar {...ICON} /></SideButton>
      <SideButton label="Notifications"><Bell {...ICON} /></SideButton>

      <div className="side-spacer" />
      <SideButton label="Rewards"><Gift {...ICON} /></SideButton>
      <SideButton label="Settings"><Settings {...ICON} /></SideButton>
    </nav>
  );
}

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick?: () => void }) {
  return (
    <button className="menu-item" role="menuitem" onClick={() => (store.set({ popover: null }), onClick?.())}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function LogoMenu() {
  const i = { size: 18, strokeWidth: 1.75 };
  const lobby = useStore((s) => s.net.lobby);
  const myLobby = useStore((s) => s.myLobby);
  return (
    <div className="menu" role="menu">
      <button className="btn primary wide" onClick={() => store.set({ popover: null, modal: "invite" })}>
        <UserPlus size={18} strokeWidth={2} /> Invite to lobby
      </button>
      <div className="menu-group">
        <MenuItem icon={<Settings {...i} />}>Settings</MenuItem>
        <MenuItem icon={<SquarePen {...i} />}>Report an issue</MenuItem>
        <MenuItem icon={<CircleHelp {...i} />}>Help docs</MenuItem>
        {lobby !== MAIN_LOBBY && <MenuItem icon={<DoorOpen {...i} />} onClick={() => void joinLobby(MAIN_LOBBY)}>Go to main lobby</MenuItem>}
        {lobby !== myLobby && <MenuItem icon={<House {...i} />} onClick={() => void joinLobby(myLobby)}>Go to my lobby</MenuItem>}
        <MenuItem icon={<Sprout {...i} />}>Decorate desk</MenuItem>
      </div>
      <div className="menu-group">
        <div className="menu-label">Admin</div>
        <MenuItem icon={<LampDesk {...i} />}>Desk manager</MenuItem>
        <MenuItem icon={<Hammer {...i} />}>Edit the office</MenuItem>
        <MenuItem icon={<CreditCard {...i} />}>Billing dashboard</MenuItem>
      </div>
      <div className="menu-group">
        <MenuItem icon={<Download {...i} />}>Download desktop app</MenuItem>
      </div>
      {authEnabled && (
        <div className="menu-group">
          <MenuItem icon={<LogOut {...i} />} onClick={() => void signOut()}>Sign out</MenuItem>
        </div>
      )}
    </div>
  );
}

/** Current time in a zone, refreshed every 20 s. */
function useLocalTime(timeZone: string): string {
  const fmt = () => {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone }).format(new Date());
    } catch {
      return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date());
    }
  };
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 20_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeZone]);
  return time;
}

export function ProfileCard() {
  const name = useStore((s) => s.playerName);
  const timeZone = useStore((s) => s.timeZone);
  const time = useLocalTime(timeZone);
  const founder = useStore((s) => s.founder);
  const close = () => store.set({ popover: null });
  return (
    <div className="profile-card" role="dialog" aria-label="Your profile">
      <div className="profile-head">
        <ProfilePic size={56} status />
        <div className="profile-id">
          <div className="profile-name">{name}</div>
          <div className="profile-time"><Clock size={14} strokeWidth={2} /> {time} local time</div>
        </div>
        <button className="icon-btn plain" aria-label="Close" onClick={close}><X size={18} /></button>
      </div>
      <div className="profile-actions">
        <button className="btn primary grow" onClick={() => store.set({ popover: null, modal: "editProfile" })}>
          <User size={18} strokeWidth={2} /> Edit Profile
        </button>
        <button className="icon-btn" aria-label="Decorate desk"><Sprout size={18} /></button>
        <button className="icon-btn" aria-label="More"><EllipsisVertical size={18} /></button>
      </div>
      {founder && (
        <div className="player-about own">
          <button className="icon-btn plain about-edit" aria-label="Edit founder profile" onClick={() => store.set({ popover: null, modal: "founder" })}><Pencil size={16} /></button>
          <div className="about-stage">{optionLabel(STAGES, founder.stage)}</div>
          {founder.building && <p>{founder.building}</p>}
          <GoalChips goals={founder.goals} />
        </div>
      )}
    </div>
  );
}

export function BottomBar() {
  const profileOpen = useStore((s) => s.popover === "profile");
  const mic = useStore((s) => s.mic);
  const cam = useStore((s) => s.cam);
  const inPrivate = useStore((s) => s.net.lobby !== MAIN_LOBBY);
  return (
    <div className="bottom-bar">
      <button className="bar-me" aria-label="Your profile" aria-expanded={profileOpen} onClick={() => store.set({ popover: profileOpen ? null : "profile" })}>
        <ProfilePic size={36} status />
      </button>
      <span className="bar-sep" />
      <button className={"bar-btn" + (mic ? "" : " off")} aria-label={mic ? "Mute" : "Unmute"} aria-pressed={mic} onClick={() => void setMic(!mic)}>
        {mic ? <Mic {...ICON} /> : <MicOff {...ICON} />}
      </button>
      <button className="bar-caret" aria-label="Microphone options"><ChevronUp size={14} strokeWidth={2.5} /></button>
      <button className={"bar-btn" + (cam ? "" : " off")} aria-label={cam ? "Stop camera" : "Start camera"} aria-pressed={cam} onClick={() => void setCam(!cam)}>
        {cam ? <Video {...ICON} /> : <VideoOff {...ICON} />}
      </button>
      <button className="bar-caret" aria-label="Camera options"><ChevronUp size={14} strokeWidth={2.5} /></button>
      <button className="bar-btn" aria-label="Reactions"><Smile {...ICON} /></button>
      <button className="bar-btn" aria-label="Select area"><SquareDashed {...ICON} /></button>
      <span className="bar-sep" />
      <button className="bar-btn danger" aria-label="Leave to the main lobby" title={inPrivate ? "Leave to the main lobby" : "You are in the main lobby"} disabled={!inPrivate} onClick={() => void joinLobby(MAIN_LOBBY)}>
        <DoorOpen {...ICON} />
      </button>
    </div>
  );
}

/** Vector floor plan (SVG, so it is sharp at any size): line drawing of walls and furniture, and where you are. */
function Minimap() {
  const map = useStore((s) => s.minimap);
  const tileX = useStore((s) => s.hud.tileX);
  const tileY = useStore((s) => s.hud.tileY);
  /** Clicking the map toggles a 30% larger view. */
  const [big, setBig] = useState(false);

  // Outline of the solid walls (only the sides that face open floor) + the thin edge walls, as one path.
  const lines = useMemo(() => {
    if (!map) return "";
    const wall = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height && map.walls[y * map.width + x] === 1;
    let d = "";
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        if (!wall(x, y)) continue;
        if (!wall(x, y - 1)) d += `M${x} ${y}h1`;
        if (!wall(x, y + 1)) d += `M${x} ${y + 1}h1`;
        if (!wall(x - 1, y)) d += `M${x} ${y}v1`;
        if (!wall(x + 1, y)) d += `M${x + 1} ${y}v1`;
      }
    for (const e of map.edges) d += `M${e.x} ${e.y}${e.side === "W" ? "v1" : "h1"}`;
    return d;
  }, [map]);

  if (!map) return null;
  return (
    <button className={"minimap" + (big ? " big" : "")} aria-label={big ? "Shrink minimap" : "Enlarge minimap"} aria-pressed={big} onClick={() => setBig(!big)}>
      <svg viewBox={`-0.5 -0.5 ${map.width + 1} ${map.height + 1}`} style={{ aspectRatio: `${map.width + 1} / ${map.height + 1}` }}>
        {map.furniture.map((f, i) => <rect key={i} x={f.x + 0.12} y={f.y + 0.12} width={Math.max(0.2, f.w - 0.24)} height={Math.max(0.2, f.h - 0.24)} rx="0.18" className="mm-furniture" />)}
        <rect width={map.width} height={map.height} className="mm-line" />
        <path d={lines} className="mm-line" />
        <g className="mm-me" style={{ transform: `translate(${tileX + 0.5}px, ${tileY + 0.5}px)` }}>
          <circle r="1.35" className="mm-me-halo" />
          <circle r="0.56" className="mm-me-dot" />
        </g>
      </svg>
    </button>
  );
}

export function MapControls() {
  const minimapOpen = useStore((s) => s.minimapOpen);
  const anyDebug = useStore((s) => s.debug.grid || s.debug.collision || s.debug.depth);
  const zoom = (dir: 1 | -1) => store.set((s) => ({ zoomCmd: { n: s.zoomCmd.n + 1, dir } }));
  return (
    <>
      {minimapOpen && <Minimap />}
      <div className="map-controls">
        <button className="ctl" aria-label="Desks"><LampDesk size={18} /></button>
        <button className="ctl" aria-label="Find me"><Navigation size={18} /></button>
        <div className="ctl-group">
          <button className="ctl" aria-label="Zoom in" onClick={() => zoom(1)}><Plus size={18} /></button>
          <button className="ctl" aria-label="Zoom out" onClick={() => zoom(-1)}><Minus size={18} /></button>
          <button className={"ctl" + (minimapOpen ? " on" : "")} aria-label="Toggle minimap" aria-pressed={minimapOpen} onClick={() => store.set({ minimapOpen: !minimapOpen })}>
            <MapIcon size={18} />
          </button>
          <button
            className={"ctl" + (anyDebug ? " on" : "")}
            aria-label="Toggle debug overlays"
            aria-pressed={anyDebug}
            onClick={() => store.set({ debug: { grid: !anyDebug, collision: !anyDebug, depth: !anyDebug } })}
          >
            <Ellipsis size={18} />
          </button>
        </div>
      </div>
    </>
  );
}

export function SidebarToggle() {
  const open = useStore((s) => s.sidebarOpen);
  return (
    <button className="ctl sidebar-toggle" aria-label={open ? "Hide sidebar" : "Show sidebar"} aria-pressed={open} onClick={() => store.set({ sidebarOpen: !open, popover: null })}>
      <PanelLeft size={18} />
    </button>
  );
}
