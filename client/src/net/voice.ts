/**
 * Voice and video, peer to peer (WebRTC). The room server only relays signaling.
 *
 * One rule decides who you are connected to: everyone within earshot, plus everyone you are in a
 * call with. Whatever your mic and camera produce goes to all of those peers; proximity peers fade
 * with distance, call peers are always at full volume.
 *
 * Every connection carries exactly one audio and one video transceiver, negotiated once. Muting,
 * unmuting and starting the camera swap the track on the sender (`replaceTrack`), so there is never
 * a renegotiation — and therefore no offer collisions to resolve. The player with the smaller
 * session id always makes the offer.
 */
import { VOICE, tileDistance, voiceVolume, type CallKind, type RtcData } from "@ft/shared";
import { store, type Calls } from "../state/store";
import { ICE_SERVERS, ICE_OVERRIDE, SERVER_URL } from "./config";
import { onCall, onRtc, sendCall, sendMedia, sendRtc } from "./room";
import { getToken } from "./session";

type Kind = "audio" | "video";

/** What to ask the browser for: the device picked in Settings (`deviceId`, "" = system default) and the audio clean-up. */
function constraints(kind: Kind, deviceId: string): MediaStreamConstraints {
  const device = deviceId ? { deviceId: { exact: deviceId } } : {};
  return kind === "audio"
    ? { audio: { ...device, echoCancellation: true, noiseSuppression: store.get().settings.noiseSuppression, autoGainControl: true } }
    : { video: { ...device, width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } };
}
const chosen = (kind: Kind) => store.get().settings[kind === "audio" ? "micId" : "camId"];
const BLOCKED: Record<Kind, string> = {
  audio: "Microphone is blocked — allow it in your browser's site settings.",
  video: "Camera is blocked — allow it in your browser's site settings.",
};
/** Mic level (RMS, 0–1) above which you count as speaking, and how long the icon lingers after. */
const SPEAK_LEVEL = 0.02;
const SPEAK_HOLD_MS = 350;
const RING_MS = 30_000;

// ── local devices ──────────────────────────────────────────────────────────────

const tracks: Record<Kind, MediaStreamTrack | null> = { audio: null, video: null };
const busy: Record<Kind, boolean> = { audio: false, video: false };
let meter: { ctx: AudioContext; timer: ReturnType<typeof setInterval> } | null = null;

function setSpeaking(on: boolean) {
  if (store.get().speaking === on) return;
  store.set({ speaking: on });
  sendMedia({ speaking: on });
}

function startMeter(track: MediaStreamTrack) {
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let lastLoud = 0;
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    const now = performance.now();
    if (Math.sqrt(sum / samples.length) > SPEAK_LEVEL) lastLoud = now;
    setSpeaking(now - lastLoud < SPEAK_HOLD_MS);
  }, 100);
  meter = { ctx, timer };
}

function stopMeter() {
  if (!meter) return;
  clearInterval(meter.timer);
  void meter.ctx.close();
  meter = null;
  setSpeaking(false);
}

async function setDevice(kind: Kind, on: boolean) {
  if (busy[kind] || on === !!tracks[kind]) return;
  if (on) {
    busy[kind] = true;
    try {
      const get = (deviceId: string) => navigator.mediaDevices.getUserMedia(constraints(kind, deviceId));
      // the chosen device may be unplugged: fall back to the system default
      const stream = await get(chosen(kind)).catch((e) => (chosen(kind) ? get("") : Promise.reject(e)));
      const track = stream.getTracks()[0]!;
      track.onended = () => void setDevice(kind, false); // unplugged, or permission revoked
      tracks[kind] = track;
    } catch {
      store.set({ notice: BLOCKED[kind] });
      return;
    } finally {
      busy[kind] = false;
    }
  } else {
    tracks[kind]!.onended = null;
    tracks[kind]!.stop();
    tracks[kind] = null;
  }
  const track = tracks[kind];
  for (const { pc } of peers.values()) void sender(pc, kind)?.replaceTrack(track);
  if (kind === "audio") {
    store.set({ mic: !!track });
    if (track) startMeter(track);
    else stopMeter();
  } else {
    store.set({ cam: !!track, localVideo: track ? new MediaStream([track]) : null });
    sendMedia({ cam: !!track });
  }
}

export const setMic = (on: boolean) => setDevice("audio", on);
export const setCam = (on: boolean) => setDevice("video", on);

/** A device setting changed: if that device is on, reopen it with the new choice. */
async function reopen(kind: Kind) {
  if (!tracks[kind]) return;
  await setDevice(kind, false);
  await setDevice(kind, true);
}

/** Microphones or cameras to choose from. Browsers only name them once the device has been allowed. */
export async function listDevices(kind: Kind): Promise<{ id: string; label: string }[]> {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all
      .filter((d) => d.kind === `${kind}input` && d.deviceId && d.deviceId !== "default")
      .map((d, i) => ({ id: d.deviceId, label: d.label || `${kind === "audio" ? "Microphone" : "Camera"} ${i + 1}` }));
  } catch {
    return [];
  }
}

// ── peer connections ───────────────────────────────────────────────────────────

interface Peer {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
}
const peers = new Map<string, Peer>();

/**
 * STUN until the server hands out TURN credentials (`GET /ice`, Cloudflare Realtime). They last a
 * day, so they are refreshed every 12 h; new connections use the latest set, open ones are updated.
 */
let iceServers: RTCIceServer[] = ICE_SERVERS;
const ICE_REFRESH_MS = 12 * 60 * 60 * 1000;
async function refreshIce() {
  try {
    const token = await getToken();
    const res = await fetch(`${SERVER_URL}/ice`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = (await res.json()) as { iceServers: RTCIceServer[] | null };
    if (!body.iceServers?.length) return;
    iceServers = body.iceServers;
    for (const { pc } of peers.values()) pc.setConfiguration({ ...pc.getConfiguration(), iceServers });
  } catch {
    /* keep what we have; calls on open networks still work over STUN */
  }
}

const sender = (pc: RTCPeerConnection, kind: Kind) => pc.getTransceivers().find((t) => t.receiver.track.kind === kind)?.sender;

/** Connect to a player: with `offer` we answer theirs, without we make ours. */
function open(id: string, offer?: RTCSessionDescriptionInit) {
  const pc = new RTCPeerConnection({ iceServers });
  const audio = new Audio();
  audio.autoplay = true;
  peers.set(id, { pc, audio });

  pc.onicecandidate = (e) => e.candidate && sendRtc(id, { ice: e.candidate.toJSON() });
  pc.ontrack = (e) => {
    const stream = new MediaStream([e.track]);
    if (e.track.kind === "audio") audio.srcObject = stream;
    else store.set((s) => ({ videos: { ...s.videos, [id]: stream } }));
  };
  pc.onconnectionstatechange = () => pc.connectionState === "failed" && close(id, true);

  const negotiate = async () => {
    if (offer) {
      await pc.setRemoteDescription(offer);
      for (const t of pc.getTransceivers()) {
        t.direction = "sendrecv";
        await t.sender.replaceTrack(tracks[t.receiver.track.kind as Kind]);
      }
      await pc.setLocalDescription(await pc.createAnswer());
    } else {
      for (const kind of ["audio", "video"] as const) pc.addTransceiver(tracks[kind] ?? kind, { direction: "sendrecv" });
      await pc.setLocalDescription(await pc.createOffer());
    }
    sendRtc(id, { sdp: pc.localDescription!.toJSON() });
  };
  negotiate().catch(() => close(id, true));
}

function close(id: string, tell: boolean) {
  const peer = peers.get(id);
  if (!peer) return;
  peers.delete(id);
  peer.pc.close();
  peer.audio.srcObject = null;
  store.set((s) => {
    const { [id]: _gone, ...videos } = s.videos;
    return { videos };
  });
  if (tell) sendRtc(id, { bye: true });
}

function onSignal(from: string, data: RtcData) {
  const peer = peers.get(from);
  if ("bye" in data) close(from, false);
  else if ("ice" in data) void peer?.pc.addIceCandidate(data.ice as RTCIceCandidateInit).catch(() => undefined);
  else if (data.sdp.type === "offer") {
    close(from, false); // a new offer replaces whatever we had with them
    open(from, data.sdp as RTCSessionDescriptionInit);
  } else void peer?.pc.setRemoteDescription(data.sdp as RTCSessionDescriptionInit).catch(() => close(from, true));
}

/** Apply the rule: who should be connected right now, and how loud are they. */
function tick() {
  const s = store.get();
  const me = s.selfId ? s.players[s.selfId] : undefined;

  // calls end when the other player leaves the room, and unanswered rings time out
  const { peers: inCall, incoming, outgoing } = s.calls;
  for (const id of [...inCall, incoming, outgoing]) if (id && !s.players[id]) dropCall(id);
  if (outgoing && s.players[outgoing] && Date.now() > ringUntil) {
    store.set({ notice: `${s.players[outgoing]!.name} did not answer.` });
    endCall(outgoing);
  }

  for (const id of [...peers.keys()]) {
    const p = s.players[id];
    if (!me || !p || (!inCall.includes(id) && tileDistance(me, p) > VOICE.disconnect)) close(id, !!p);
  }
  if (!me) return;
  for (const p of Object.values(s.players)) {
    if (p.id === me.id) continue;
    const called = inCall.includes(p.id);
    const distance = tileDistance(me, p);
    const peer = peers.get(p.id);
    if (peer) peer.audio.volume = (called ? 1 : voiceVolume(distance)) * s.settings.volume;
    else if ((called || distance <= VOICE.connect) && me.id < p.id) open(p.id);
  }
}

// ── video calls ────────────────────────────────────────────────────────────────

let ringUntil = 0;
const setCalls = (patch: Partial<Calls>) => store.set((s) => ({ calls: { ...s.calls, ...patch } }));

function connectCall(id: string) {
  setCalls({ peers: [...store.get().calls.peers, id], incoming: null, outgoing: null });
  void setMic(true);
  void setCam(true);
}

function dropCall(id: string) {
  const c = store.get().calls;
  const left = c.peers.filter((p) => p !== id);
  setCalls({ peers: left, incoming: c.incoming === id ? null : c.incoming, outgoing: c.outgoing === id ? null : c.outgoing });
  if (c.peers.length && !left.length) void setCam(false); // last call over: camera off, mic stays as it was
}

export function startCall(id: string) {
  const c = store.get().calls;
  if (c.incoming || c.outgoing || c.peers.includes(id)) return;
  ringUntil = Date.now() + RING_MS;
  setCalls({ outgoing: id });
  sendCall(id, "invite");
}

export function acceptCall() {
  const id = store.get().calls.incoming;
  if (!id) return;
  sendCall(id, "accept");
  connectCall(id);
}

export function declineCall() {
  const id = store.get().calls.incoming;
  if (!id) return;
  sendCall(id, "decline");
  setCalls({ incoming: null });
}

/** Hang up, or cancel a call that is still ringing. */
export function endCall(id: string) {
  sendCall(id, "end");
  dropCall(id);
}

function onCallSignal(from: string, kind: CallKind) {
  const c = store.get().calls;
  if (kind === "invite") {
    if (c.peers.includes(from)) return;
    if (c.outgoing === from) {
      // we were ringing each other: that is a yes from both
      sendCall(from, "accept");
      connectCall(from);
    } else if (c.incoming || c.outgoing) sendCall(from, "decline");
    else setCalls({ incoming: from });
  } else if (kind === "accept") {
    if (c.outgoing === from) connectCall(from);
  } else if (kind === "decline") {
    if (c.outgoing !== from) return;
    setCalls({ outgoing: null });
    store.set({ notice: `${store.get().players[from]?.name ?? "They"} can't talk right now.` });
  } else dropCall(from);
}

/** Start listening for peers and calls. Call once, when the game starts. */
export function startVoice() {
  if (!ICE_OVERRIDE) {
    void refreshIce();
    setInterval(() => void refreshIce(), ICE_REFRESH_MS);
  }
  onRtc(onSignal);
  onCall(onCallSignal);
  setInterval(tick, 250);
  // a fresh room session starts with both flags off: tell it what is actually on
  store.watch((s) => s.selfId, (id) => id && sendMedia({ speaking: store.get().speaking, cam: store.get().cam }));
  // Settings → devices
  store.watch((s) => `${s.settings.micId}|${s.settings.noiseSuppression}`, () => void reopen("audio"));
  store.watch((s) => s.settings.camId, () => void reopen("video"));
}
