import { useEffect, useState, type ReactNode } from "react";
import { store, useStore } from "../state/store";
import { BottomBar, LogoMenu, MapControls, ProfileCard, Sidebar, SidebarToggle } from "./Shell";
import { EditProfile } from "./EditProfile";
import { EditAvatar } from "./EditAvatar";
import { AuthScreen } from "./Auth";
import { Onboarding } from "./Onboarding";
import { CallLayer, InviteDialog, LobbyChip, Notice, PlayerCard } from "./Social";
import { CalendarView, MeetingDialog } from "./Calendar";
import { SettingsDialog } from "./Settings";

/** Matches `--t-open` in styles.css. */
const EXIT_MS = 200;

/** Keeps its children mounted for one exit animation after `show` turns false (`data-closing` drives the CSS). */
function Presence({ show, children }: { show: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) return setMounted(true);
    const id = setTimeout(() => setMounted(false), EXIT_MS);
    return () => clearTimeout(id);
  }, [show]);
  if (!show && !mounted) return null;
  return <div className="presence" data-closing={show ? undefined : ""}>{children}</div>;
}

export function App() {
  const ready = useStore((s) => s.ready);
  const status = useStore((s) => s.session.status);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const popover = useStore((s) => s.popover);
  const modal = useStore((s) => s.modal);
  const view = useStore((s) => s.view);
  const avatarReturn = useStore((s) => s.avatarReturn);
  const hud = useStore((s) => s.hud);
  const debug = useStore((s) => s.debug);
  const anyDebug = debug.grid || debug.collision || debug.depth;

  // The game frame (#game) lives outside React; its inset follows the sidebar through a body class.
  useEffect(() => {
    document.body.classList.toggle("no-sidebar", !sidebarOpen);
  }, [sidebarOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const s = store.get();
      if (s.popover) store.set({ popover: null });
      else if (s.modal === "editAvatar") store.set({ modal: s.avatarReturn, avatarReturn: null });
      else if (s.modal) store.set({ modal: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Before the game: sign in, then the founder questions.
  if (status !== "ready")
    return (
      <>
        {status === "loading" && <div className="screen"><div className="loading">Loading Founder Town…</div></div>}
        {(status === "signedOut" || status === "recovery") && <AuthScreen />}
        {status === "onboarding" && <Onboarding />}
        <Notice />
      </>
    );

  return (
    <>
      {/* always mounted: it slides out via body.no-sidebar instead of popping */}
      <Sidebar />

      <div className="frame-ui">
        {!ready && <div className="loading">Loading Founder Town…</div>}
        {ready && (
          <>
            <div className="frame-top">
              <SidebarToggle />
              <LobbyChip />
              {hud.zone && <span className="zone-chip">{hud.zone.replace("_", " ")}</span>}
            </div>
            {anyDebug && (
              <div className="debug-panel">
                <div>fps {hud.fps}</div>
                <div>tile {hud.tileX},{hud.tileY}</div>
                <div>zoom {hud.zoom}×</div>
                <div className="muted">F1 grid · F2 collision · F3 depth</div>
              </div>
            )}
            {view === "map" && <MapControls />}
            {view === "map" && <BottomBar />}
            {/* the calendar page covers the town (which keeps running); calls stay on top of it */}
            <Presence show={view === "calendar"}><CalendarView /></Presence>
            <CallLayer />
          </>
        )}
      </div>

      {popover && <div className="popover-catch" onMouseDown={() => store.set({ popover: null })} />}
      <Presence show={popover === "menu"}><LogoMenu /></Presence>
      <Presence show={popover === "profile"}><ProfileCard /></Presence>
      <Presence show={popover === "player"}><PlayerCard /></Presence>

      {/* stays mounted under Edit Avatar so unsaved name/time-zone edits survive the round trip */}
      <Presence show={modal === "editProfile" || (modal === "editAvatar" && avatarReturn === "editProfile")}><EditProfile /></Presence>
      <Presence show={modal === "editAvatar"}><EditAvatar /></Presence>
      <Presence show={modal === "invite"}><InviteDialog /></Presence>
      <Presence show={modal === "founder"}><Onboarding edit /></Presence>
      <Presence show={modal === "settings"}><SettingsDialog /></Presence>
      <Presence show={modal === "meeting"}><MeetingDialog /></Presence>
      <Notice />
    </>
  );
}
