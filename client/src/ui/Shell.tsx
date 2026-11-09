/**
 * App chrome around the game frame: left sidebar, logo menu, bottom bar, map controls, profile card.
 * Everything here is UI only — it talks to the game through the store.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bell, Calendar, ChevronDown, ChevronUp, CircleHelp, Clock, Code, CreditCard, DoorOpen, Download, Ellipsis, EllipsisVertical,
  Gift, Hammer, LampDesk, LogOut, Map as MapIcon, MessagesSquare, Mic, MicOff, Minus, Music, Navigation, PanelLeft, Plus,
  Search, Settings, Smile, Sprout, SquareDashed, SquarePen, User, UserPlus, Video, VideoOff, X,
} from "lucide-react";
import { store, useStore } from "../state/store";

const ICON = { size: 20, strokeWidth: 1.75 } as const;

/**
 * Founder Town mark: a mixed-fruit tanghulu — strawberry, citrus slice and a hawthorn berry on a skewer.
 * Solid silhouettes in the current color — no inner detail.
 */
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <g transform="rotate(38 12 12)">
        <path d="M12 0.6v23.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        {/* strawberry, tip toward the point of the skewer */}
        <path fill="currentColor" d="M12 1.6c2.3 1.3 3.6 3.4 3.4 4.9-.2 1.3-1.7 1.6-3.4 1.6s-3.2-.3-3.4-1.6C8.4 5 9.7 2.9 12 1.6z" />
        {/* citrus slice */}
        <circle cx="12" cy="11.6" r="3.5" fill="currentColor" />
        {/* hawthorn berry */}
        <circle cx="12" cy="18.3" r="3.1" fill="currentColor" />
      </g>
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

function MenuItem({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <button className="menu-item" role="menuitem" onClick={() => store.set({ popover: null })}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function LogoMenu() {
  const i = { size: 18, strokeWidth: 1.75 };
  return (
    <div className="menu" role="menu">
      <button className="btn primary wide" onClick={() => store.set({ popover: null })}>
        <UserPlus size={18} strokeWidth={2} /> Invite to office
      </button>
      <div className="menu-group">
        <MenuItem icon={<Settings {...i} />}>Settings</MenuItem>
        <MenuItem icon={<SquarePen {...i} />}>Report an issue</MenuItem>
        <MenuItem icon={<CircleHelp {...i} />}>Help docs</MenuItem>
        <MenuItem icon={<DoorOpen {...i} />}>Go to lobby</MenuItem>
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
      <div className="menu-group">
        <MenuItem icon={<DoorOpen {...i} />}>Leave office</MenuItem>
        <MenuItem icon={<LogOut {...i} />}>Sign out</MenuItem>
      </div>
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
  const [promo, setPromo] = useState(true);
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
      {promo && (
        <div className="profile-promo">
          <button className="icon-btn plain promo-close" aria-label="Dismiss" onClick={() => setPromo(false)}><X size={16} /></button>
          <div className="promo-icons"><Calendar size={20} /><Code size={20} /><Music size={20} /></div>
          <p>Share your calendar, code and music activity on your profile</p>
          <button className="btn outline">Connect apps</button>
        </div>
      )}
    </div>
  );
}

export function BottomBar() {
  const profileOpen = useStore((s) => s.popover === "profile");
  const [mic, setMic] = useState(false);
  const [cam, setCam] = useState(false);
  return (
    <div className="bottom-bar">
      <button className="bar-me" aria-label="Your profile" aria-expanded={profileOpen} onClick={() => store.set({ popover: profileOpen ? null : "profile" })}>
        <ProfilePic size={36} status />
      </button>
      <span className="bar-sep" />
      <button className={"bar-btn" + (mic ? "" : " off")} aria-label={mic ? "Mute" : "Unmute"} aria-pressed={mic} onClick={() => setMic(!mic)}>
        {mic ? <Mic {...ICON} /> : <MicOff {...ICON} />}
      </button>
      <button className="bar-caret" aria-label="Microphone options"><ChevronUp size={14} strokeWidth={2.5} /></button>
      <button className={"bar-btn" + (cam ? "" : " off")} aria-label={cam ? "Stop camera" : "Start camera"} aria-pressed={cam} onClick={() => setCam(!cam)}>
        {cam ? <Video {...ICON} /> : <VideoOff {...ICON} />}
      </button>
      <button className="bar-caret" aria-label="Camera options"><ChevronUp size={14} strokeWidth={2.5} /></button>
      <button className="bar-btn" aria-label="Reactions"><Smile {...ICON} /></button>
      <button className="bar-btn" aria-label="Select area"><SquareDashed {...ICON} /></button>
      <span className="bar-sep" />
      <button className="bar-btn danger" aria-label="Leave office"><DoorOpen {...ICON} /></button>
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
