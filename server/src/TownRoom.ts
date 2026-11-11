/**
 * One lobby of the town. The room owns who is here and where they stand; movement is validated
 * against the same collision grid the client predicts with (`@ft/shared`). Voice and video are
 * peer-to-peer — the room only relays their signaling between two players.
 */
import { readFileSync } from "node:fs";
import { Room, type Client } from "colyseus";
import { schema, t, type SchemaType } from "@colyseus/schema";
import {
  DIRS, MAX_PLAYERS, MSG, STEP_MS, parseWorld, sanitizeFounder, sanitizeName,
  type CallKind, type Dir, type JoinOptions, type MediaMsg, type MoveMsg, type ProfileMsg, type Relay, type RtcData, type SnapMsg,
  type TiledMap, type WorldData,
} from "@ft/shared";
import { lobbyTitle, verifyUser } from "./auth.js";
import { env } from "./env.js";

export const Player = schema({
  name: t.string(),
  avatar: t.string(),
  stage: t.string(),
  building: t.string(),
  goals: t.string(),
  x: t.number(),
  y: t.number(),
  dir: t.string(),
  speaking: t.boolean(),
  cam: t.boolean(),
}, "Player");
export type Player = SchemaType<typeof Player>;

export const TownState = schema({
  title: t.string(),
  players: t.map(Player),
}, "TownState");
export type TownState = SchemaType<typeof TownState>;

/** Largest avatar JSON we store (a full avatar is ~400 bytes). */
const AVATAR_MAX = 2000;
/** Steps a client may send in a burst before it is ahead of what walking allows. */
const STEP_BURST = 4;

/** Parsed once at startup, so a missing or broken map stops the server instead of the first join. */
const world: WorldData = parseWorld(JSON.parse(readFileSync(env.mapPath, "utf8")) as TiledMap);

function applyProfile(p: Player, msg: Partial<ProfileMsg>) {
  const founder = sanitizeFounder(msg.founder);
  const avatar = JSON.stringify(msg.avatar ?? null);
  p.name = sanitizeName(msg.name);
  if (avatar.length <= AVATAR_MAX) p.avatar = avatar;
  p.stage = founder.stage;
  p.building = founder.building;
  p.goals = founder.goals.join(",");
}

export class TownRoom extends Room<{ state: TownState }> {
  maxClients = MAX_PLAYERS;
  /** Walking is ~6 messages/s and call setup a short burst; anything far above that is not a real client. */
  maxMessagesPerSecond = 80;
  state = new TownState();
  private world = world;
  /** Per-client step allowance (token bucket): refills at walking speed. */
  private steps = new Map<string, { budget: number; at: number }>();

  async onAuth(_client: Client, options: JoinOptions) {
    const user = await verifyUser(options.token);
    if (!user) throw new Error("Sign in to enter Founder Town.");
    const title = await lobbyTitle(options.lobby, options.token);
    if (!title) throw new Error("That lobby does not exist.");
    this.state.title = title;
    return user;
  }

  onCreate() {
    this.onMessage<MoveMsg>(MSG.move, (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !DIRS.includes(msg?.dir)) return;
      if (msg.x === p.x && msg.y === p.y) return void (p.dir = msg.dir); // turned in place
      const adjacent = Math.abs(msg.x - p.x) + Math.abs(msg.y - p.y) === 1;
      if (adjacent && this.world.grid.canStep(p.x, p.y, msg.x, msg.y) && this.spendStep(client.sessionId)) {
        p.x = msg.x;
        p.y = msg.y;
        p.dir = msg.dir;
      } else client.send(MSG.snap, { x: p.x, y: p.y } satisfies SnapMsg);
    });

    this.onMessage<ProfileMsg>(MSG.profile, (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (p && msg) applyProfile(p, msg);
    });

    this.onMessage<MediaMsg>(MSG.media, (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p || !msg) return;
      if (typeof msg.speaking === "boolean") p.speaking = msg.speaking;
      if (typeof msg.cam === "boolean") p.cam = msg.cam;
    });

    // Signaling and call handshakes go to one other player in this room, stamped with the sender.
    for (const type of [MSG.rtc, MSG.call])
      this.onMessage<Relay<RtcData | CallKind>>(type, (client, msg) => {
        if (typeof msg?.to !== "string") return;
        this.clients.getById(msg.to)?.send(type, { from: client.sessionId, data: msg.data });
      });
  }

  onJoin(client: Client, options: JoinOptions) {
    const p = new Player();
    applyProfile(p, options);
    const at = this.startTile(options.at);
    p.x = at.x;
    p.y = at.y;
    p.dir = "down" satisfies Dir;
    p.speaking = false;
    p.cam = false;
    this.state.players.set(client.sessionId, p);
    this.steps.set(client.sessionId, { budget: STEP_BURST, at: Date.now() });
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.steps.delete(client.sessionId);
  }

  private spendStep(id: string): boolean {
    const s = this.steps.get(id);
    if (!s) return false;
    const now = Date.now();
    s.budget = Math.min(STEP_BURST, s.budget + (now - s.at) / STEP_MS);
    s.at = now;
    if (s.budget < 1) return false;
    s.budget -= 1;
    return true;
  }

  /** Where a joining player stands: where they were (rejoin), else a free tile next to the map's main spawn. */
  private startTile(at: JoinOptions["at"]): { x: number; y: number } {
    const { grid, spawns } = this.world;
    if (at && Number.isInteger(at.x) && Number.isInteger(at.y) && !grid.isBlocked(at.x, at.y)) return { x: at.x, y: at.y };
    const spawn = spawns.find((s) => s.name === "main") ?? { tileX: 1, tileY: 1 };
    for (let tries = 0; tries < 20; tries++) {
      const x = spawn.tileX + Math.floor(Math.random() * 5) - 2;
      const y = spawn.tileY + Math.floor(Math.random() * 3);
      if (!grid.isBlocked(x, y)) return { x, y };
    }
    return { x: spawn.tileX, y: spawn.tileY };
  }
}
