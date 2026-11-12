/**
 * Multiplayer UI: which lobby you are in, inviting people, other players' cards, calls and video.
 * Like the rest of the shell it only reads the store and calls the net layer's actions.
 */
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Copy, DoorOpen, Link as LinkIcon, Mail, Maximize2, Mic, MicOff, Minimize2, Phone, PhoneOff, Video, X } from "lucide-react";
import { MAIN_LOBBY, STAGES, optionLabel } from "@ft/shared";
import { emailInvite, joinLobby, lobbyUrl } from "../net/room";
import { acceptCall, declineCall, endCall, setMic, startCall } from "../net/voice";
import { store, useStore } from "../state/store";
import { AvatarSprite, CROP } from "./AvatarSprite";
import { GoalChips } from "./PixelIcon";

/** Lobby name, connection state and head count — top left of the frame. */
export function LobbyChip() {
  const net = useStore((s) => s.net);
  const count = useStore((s) => Object.keys(s.players).length);
  const label = net.status === "online" ? `${net.title || "Lobby"} · ${count} online` : net.status === "connecting" ? "Connecting…" : "Offline — reconnecting…";
  return (
    <span className={"zone-chip lobby-chip " + net.status}>
      <i className="lobby-dot" />
      {label}
    </span>
  );
}

/** Short message from anywhere in the app; clears itself. */
export function Notice() {
  const notice = useStore((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => store.set({ notice: null }), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  return notice ? <div className="notice" role="status">{notice}</div> : null;
}

/** Card of the player you clicked: who they are, and the call button. */
export function PlayerCard() {
  const player = useStore((s) => (s.selected ? s.players[s.selected] : undefined));
  const calls = useStore((s) => s.calls);
  // Keep showing the last player while the card animates out, or after they leave.
  const last = useRef(player);
  if (player) last.current = player;
  const p = last.current;
  if (!p) return null;

  const close = () => store.set({ popover: null });
  const here = !!player;
  const inCall = calls.peers.includes(p.id);
  const ringing = calls.outgoing === p.id;
  return (
    <div className="profile-card" role="dialog" aria-label={p.name}>
      <div className="profile-head">
        <span className="circle small"><AvatarSprite avatar={p.avatar} crop={CROP.bust} scale={1} /></span>
        <div className="profile-id">
          <div className="profile-name">{p.name}</div>
          <div className="profile-time">{optionLabel(STAGES, p.stage) || "Founder"}</div>
        </div>
        <button className="icon-btn plain" aria-label="Close" onClick={close}><X size={18} /></button>
      </div>
      {(p.building || p.goals.length > 0) && (
        <div className="player-about">
          {p.building && <p>{p.building}</p>}
          {p.goals.length > 0 && <GoalChips goals={p.goals} />}
        </div>
      )}
      <div className="profile-actions">
        {inCall || ringing ? (
          <button className="btn danger grow" onClick={() => endCall(p.id)}><PhoneOff size={18} strokeWidth={2} /> {inCall ? "Hang up" : "Cancel call"}</button>
        ) : (
          <button className="btn primary grow" disabled={!here || !!calls.outgoing || !!calls.incoming} onClick={() => (startCall(p.id), close())}>
            <Video size={18} strokeWidth={2} /> {here ? "Video call" : "Left the lobby"}
          </button>
        )}
      </div>
    </div>
  );
}

function VideoTile({ stream, name, mirror = false }: { stream: MediaStream; name: string; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className={"video-tile" + (mirror ? " mirror" : "")}>
      {/* always muted: remote sound plays through the voice layer, at proximity volume */}
      <video ref={ref} autoPlay playsInline muted />
      <span className="video-name">{name}</span>
    </div>
  );
}

/**
 * Ringing (both directions) and the call panel: everyone you can currently see, in a grid inside one
 * dark frame docked top-right. It can grow to fill the game frame (and shrink back), eased over 400ms.
 */
export function CallLayer() {
  const calls = useStore((s) => s.calls);
  const players = useStore((s) => s.players);
  const videos = useStore((s) => s.videos);
  const localVideo = useStore((s) => s.localVideo);
  const mirror = useStore((s) => s.settings.mirror);
  const mic = useStore((s) => s.mic);
  const [full, setFull] = useState(false);
  const caller = calls.incoming ? players[calls.incoming] : undefined;
  const callee = calls.outgoing ? players[calls.outgoing] : undefined;
  const live = Object.keys(videos).filter((id) => players[id]?.cam);
  const tiles = live.length + (localVideo ? 1 : 0);
  // Grid: docked it is one row up to three people, then two rows; full screen it is as square as possible.
  const cols = full ? Math.ceil(Math.sqrt(tiles)) : tiles <= 3 ? tiles : Math.ceil(tiles / 2);
  const rows = Math.ceil(tiles / Math.max(1, cols));

  // Escape leaves full screen (before it closes anything else); an empty panel forgets it.
  useEffect(() => {
    if (!tiles) return setFull(false);
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setFull(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [full, tiles]);

  return (
    <>
      {tiles > 0 && (
        <section className={"call-panel" + (full ? " full" : "")} style={{ "--cols": cols, "--rows": rows } as CSSProperties} aria-label="Video call">
          <div className="call-tiles">
            {live.map((id) => <VideoTile key={id} stream={videos[id]!} name={players[id]!.name} />)}
            {localVideo && <VideoTile stream={localVideo} name="You" mirror={mirror} />}
          </div>
          <div className="call-bar">
            <button className={"bar-btn" + (mic ? "" : " off")} aria-label={mic ? "Mute" : "Unmute"} aria-pressed={mic} title={mic ? "Mute microphone" : "Unmute microphone"} onClick={() => void setMic(!mic)}>
              {mic ? <Mic size={18} strokeWidth={1.75} /> : <MicOff size={18} strokeWidth={1.75} />}
            </button>
            <button className="bar-btn" aria-label={full ? "Exit full screen" : "Full screen"} aria-pressed={full} title={full ? "Exit full screen" : "Full screen"} onClick={() => setFull(!full)}>
              {full ? <Minimize2 size={18} strokeWidth={1.75} /> : <Maximize2 size={18} strokeWidth={1.75} />}
            </button>
            {calls.peers.length > 0 && (
              <button className="bar-btn danger" aria-label="Leave call" title="Leave call" onClick={() => calls.peers.forEach(endCall)}>
                <PhoneOff size={18} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </section>
      )}
      {caller && (
        <div className="ring" role="alertdialog" aria-label="Incoming call">
          <span className="circle small"><AvatarSprite avatar={caller.avatar} crop={CROP.bust} scale={1} /></span>
          <div className="ring-text"><b>{caller.name}</b><span>wants to video call</span></div>
          <button className="bar-btn danger" aria-label="Decline" title="Decline" onClick={declineCall}><PhoneOff size={20} strokeWidth={1.75} /></button>
          <button className="bar-btn accept" aria-label="Accept" title="Accept" onClick={acceptCall}><Phone size={20} strokeWidth={1.75} /></button>
        </div>
      )}
      {callee && (
        <div className="ring" role="status">
          <span className="circle small"><AvatarSprite avatar={callee.avatar} crop={CROP.bust} scale={1} /></span>
          <div className="ring-text"><b>{callee.name}</b><span>Calling…</span></div>
          <button className="bar-btn danger" aria-label="Cancel call" title="Cancel call" onClick={() => endCall(callee.id)}><PhoneOff size={20} strokeWidth={1.75} /></button>
        </div>
      )}
    </>
  );
}

/** Invite by link or email — to the private lobby you are in, or to your own when you are in the main one. */
export function InviteDialog() {
  const net = useStore((s) => s.net);
  const myLobby = useStore((s) => s.myLobby);
  const name = useStore((s) => s.playerName);
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const lobby = net.lobby === MAIN_LOBBY ? myLobby : net.lobby;
  const mine = lobby === myLobby;
  const there = net.lobby === lobby;
  const link = lobbyUrl(lobby);
  const close = () => store.set({ modal: null });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus({ ok: false, text: "Could not copy — select the link and copy it by hand." });
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const res = await emailInvite(email, lobby);
    setBusy(false);
    if (res.ok) {
      setStatus({ ok: true, text: `Invite sent to ${email}.` });
      setEmail("");
    } else if (res.unavailable) {
      // No mail service on the server: hand the invite to the user's own mail app.
      const body = `${name} invited you to their lobby in Founder Town:\n\n${link}`;
      location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Join me in Founder Town")}&body=${encodeURIComponent(body)}`;
      setStatus({ ok: true, text: "Opened your mail app with the invite." });
    } else setStatus({ ok: false, text: res.error ?? "Could not send the invite." });
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog invite" role="dialog" aria-label="Invite to lobby">
        <header className="dialog-head">
          <h2>Invite to {mine ? "your lobby" : "this lobby"}</h2>
          <button className="icon-btn plain" aria-label="Close" onClick={close}><X size={20} /></button>
        </header>
        <div className="dialog-body">
          <p className="invite-lead">
            {mine ? "Your lobby is a private copy of the office." : "This is a private lobby."} Anyone with the link can walk in, talk and call.
          </p>
          <div className="field first">
            <span><LinkIcon size={14} /> Invite link</span>
            <div className="input-row">
              <input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.target.select()} />
              <button type="button" className="btn outline" onClick={() => void copy()}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
          <form className="field" onSubmit={(e) => void send(e)}>
            <span><Mail size={14} /> Invite by email</span>
            <div className="input-row">
              <input type="email" required placeholder="cofounder@startup.com" value={email} aria-label="Email address" onChange={(e) => setEmail(e.target.value)} />
              <button type="submit" className="btn primary" disabled={busy}>Send</button>
            </div>
          </form>
          {status && <p className={status.ok ? "field-info" : "field-error"} role="status">{status.text}</p>}
        </div>
        {!there && (
          <footer className="dialog-foot">
            <button className="btn outline" onClick={() => (close(), void joinLobby(lobby))}><DoorOpen size={18} /> Go to your lobby</button>
          </footer>
        )}
      </div>
    </div>
  );
}
