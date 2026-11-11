/**
 * Everything that moves. Each frame `update()` refills the instanced box pool from scratch:
 * people, traffic, the cable car, boats, the rocket, fog… Nothing here allocates per frame.
 *
 * Traffic is the only real simulation: cars follow closed lanes around the blocks (right-hand
 * side), stop at red lights and behind whatever is in front of them.
 */
import type * as THREE from "three";
import { G, LAND0, type City, type Rect, type Spot } from "./city";
import { Boxes, color, pick, type Rand } from "./voxel";
import {
  BLACK, HAIRS, LIT, PANTS, SHIRTS, SKINS, WHITE, YC, amber, coral, dark, fabric, floor, leaf, metal, mustard, stone, tan, teal, water, wood,
} from "./palette";

type Col = THREE.Color;
const K = {
  black: color(BLACK), white: color(WHITE), yc: color(YC), lit: color(LIT), glass: color(dark[1]), glassLit: color(fabric[3]), off: color(fabric[0]),
  red: color(coral[2]), redDark: color(coral[0]), green: color(leaf[3]), amber: color(amber[2]), flame: color(amber[3]), metal: color(metal[1]),
  cream: color(floor[2]), creamLight: color(floor[3]), wood: color(wood[1]), woodLight: color(wood[2]), woodDark: color(wood[0]), drop: color(water[3]),
  tan: color(tan[2]), teal: color(teal[2]), navy: color(dark[1]), stone: color(stone[1]), hull: color(dark[0]),
};

// ── people ─────────────────────────────────────────────────────────────────────

interface Person {
  mode: "ring" | "wander" | "spot";
  x: number; y: number; z: number;
  rect: Rect;
  /** ring: distance along the loop and direction. wander: target and pause. */
  s: number; sign: number; speed: number; tx: number; tz: number; wait: number;
  kind: Spot["kind"];
  alongX: boolean; moving: boolean;
  ph: number;
  skin: Col; hair: Col; shirt: Col; pants: Col; bag: Col | null;
}

function ringPos(r: Rect, s: number, out: Person) {
  const w = r.x1 - r.x0, h = r.z1 - r.z0, p = 2 * (w + h);
  const q = ((s % p) + p) % p;
  if (q < w) (out.x = r.x0 + q), (out.z = r.z0), (out.alongX = true);
  else if (q < w + h) (out.x = r.x1), (out.z = r.z0 + q - w), (out.alongX = false);
  else if (q < 2 * w + h) (out.x = r.x1 - (q - w - h)), (out.z = r.z1), (out.alongX = true);
  else (out.x = r.x0), (out.z = r.z1 - (q - 2 * w - h)), (out.alongX = false);
}

// ── traffic ────────────────────────────────────────────────────────────────────

interface Lane { pts: [number, number][]; closed: boolean; lens: number[]; total: number }
interface Car {
  lane: Lane; s: number; v: number; vmax: number; len: number; kind: "car" | "taxi" | "robo" | "shuttle"; body: Col;
  x: number; z: number; alongX: boolean; sgn: number; stuck: number; ghost: number;
}

function lane(pts: [number, number][], closed: boolean): Lane {
  const lens: number[] = [];
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    lens.push(Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]));
  }
  return { pts, closed, lens, total: lens.reduce((a, b) => a + b, 0) };
}

/** Both directions around a rectangle of road centerlines, each on its right-hand side. */
function loopLanes(x0: number, z0: number, x1: number, z1: number): Lane[] {
  const o = 0.5;
  return [
    lane([[x0 + o, z0 + o], [x1 - o, z0 + o], [x1 - o, z1 - o], [x0 + o, z1 - o]], true),
    lane([[x0 - o, z0 - o], [x0 - o, z1 + o], [x1 + o, z1 + o], [x1 + o, z0 - o]], true),
  ];
}

function place(c: Car) {
  const l = c.lane;
  let q = ((c.s % l.total) + l.total) % l.total;
  for (let i = 0; i < l.lens.length; i++) {
    const len = l.lens[i]!;
    if (q <= len || i === l.lens.length - 1) {
      const a = l.pts[i]!, b = l.pts[(i + 1) % l.pts.length]!;
      c.alongX = a[1] === b[1];
      c.sgn = c.alongX ? Math.sign(b[0] - a[0]) : Math.sign(b[1] - a[1]);
      c.x = a[0] + (c.alongX ? c.sgn * q : 0);
      c.z = a[1] + (c.alongX ? 0 : c.sgn * q);
      return;
    }
    q -= len;
  }
}

/** Lights: 14 s cycle — roads running along z go first, then the ones along x, a second of all-red between. */
const CYCLE = 14;
const lightFor = (alongX: boolean, t: number): "go" | "slow" | "stop" => {
  const p = (t + (alongX ? CYCLE / 2 : 0)) % CYCLE;
  return p < 5 ? "go" : p < 6 ? "slow" : "stop";
};

// ── boats ──────────────────────────────────────────────────────────────────────

interface Boat { x: number; z: number; tx: number; tz: number; rect: Rect; ph: number; sail: Col }

export class Life {
  private people: Person[] = [];
  private cars: Car[] = [];
  private boats: Boat[] = [];
  private fogBanks: { x: number; y: number; z: number; parts: number[][]; v: number }[] = [];
  private birds: { ph: number; off: number[][] }[] = [];

  constructor(private city: City, private boxes: Boxes, private mist: Boxes, private r: Rand) {
    const r_ = r;
    const person = (mode: Person["mode"], rect: Rect, y: number, kind: Spot["kind"] = "stand"): Person => ({
      mode, x: 0, y, z: 0, rect, s: r_() * 100, sign: r_() < 0.5 ? 1 : -1, speed: 0.45 + r_() * 0.5, tx: 0, tz: 0, wait: r_() * 3, kind,
      alongX: r_() < 0.5, moving: false, ph: r_() * 10,
      skin: color(pick(r_, SKINS)), hair: color(r_() < 0.08 ? YC : pick(r_, HAIRS)), shirt: color(r_() < 0.12 ? YC : r_() < 0.1 ? BLACK : pick(r_, SHIRTS)),
      pants: color(pick(r_, PANTS)), bag: r_() < 0.3 ? color(pick(r_, [BLACK, YC, fabric[1], coral[1], metal[2]])) : null,
    });

    for (const ring of city.rings) {
      const central = Math.abs((ring.x0 + ring.x1) / 2) < 27 && Math.abs((ring.z0 + ring.z1) / 2) < 27;
      for (let k = 0; k < (central ? 7 : 2); k++) {
        const o = (r() - 0.5) * 0.5;
        this.people.push(person("ring", { x0: ring.x0 + o, z0: ring.z0 + o, x1: ring.x1 - o, z1: ring.z1 - o }, G));
      }
    }
    for (const a of city.areas)
      for (let k = 0; k < a.n; k++) {
        const p = person("wander", a.rect, a.y);
        p.x = p.tx = a.rect.x0 + r() * (a.rect.x1 - a.rect.x0);
        p.z = p.tz = a.rect.z0 + r() * (a.rect.z1 - a.rect.z0);
        this.people.push(p);
      }
    for (const s of city.spots) {
      const p = person("spot", { x0: 0, z0: 0, x1: 0, z1: 0 }, s.y, s.kind);
      p.x = s.x;
      p.z = s.z;
      this.people.push(p);
    }

    // traffic: loops around the central blocks (none of them drives along Market Street) + the bridge road
    const lanes = [
      ...loopLanes(-10, -10, 10, 10), ...loopLanes(0, 10, 20, 30), ...loopLanes(10, -10, 30, 10), ...loopLanes(-10, -10, 30, 20),
      ...loopLanes(-10, 10, 10, 30), ...loopLanes(20, 10, 40, 30),
      lane([[-0.5, -76], [-0.5, 74]], false), lane([[0.5, 74], [0.5, -76]], false),
    ];
    const paint = [coral[2], fabric[2], teal[2], stone[3], dark[2], tan[2], leaf[2], WHITE, BLACK, YC];
    lanes.forEach((l) => {
      const n = Math.max(3, Math.round(l.total / 15));
      for (let k = 0; k < n; k++) {
        const roll = r();
        const kind: Car["kind"] = roll < 0.12 ? "taxi" : roll < 0.26 ? "robo" : roll < 0.36 ? "shuttle" : "car";
        this.cars.push({
          lane: l, s: (k / n) * l.total + r() * 3, v: 0, vmax: 2.4 + r() * 1.2, len: kind === "shuttle" ? 2.2 : 1.25, kind,
          body: color(kind === "taxi" ? mustard[1] : kind === "robo" || kind === "shuttle" ? WHITE : pick(r, paint)),
          x: 0, z: 0, alongX: false, sgn: 1, stuck: 0, ghost: 0,
        });
      }
    });

    const waters: Rect[] = [
      { x0: -24, z0: -11, x1: -20.5, z1: 12 }, { x0: 2.5, z0: -24, x1: 22, z1: -13 }, { x0: -10, z0: -22, x1: -2.5, z1: -17.5 }, { x0: -19, z0: -2, x1: -12.5, z1: 2 },
    ];
    waters.forEach((rect, i) => {
      for (let k = 0; k < (i === 1 ? 4 : 2); k++) {
        const x = rect.x0 + r() * (rect.x1 - rect.x0), z = rect.z0 + r() * (rect.z1 - rect.z0);
        this.boats.push({ x, z, tx: x, tz: z, rect, ph: r() * 9, sail: color(pick(r, [WHITE, WHITE, YC, coral[3], mustard[3]])) });
      }
    });

    for (let k = 0; k < 6; k++) {
      const parts: number[][] = [];
      for (let q = 0; q < 6; q++) parts.push([r() * 6 - 3, r() * 0.8, r() * 4 - 2, 2 + r() * 3.5, 0.35 + r() * 0.4, 1.2 + r() * 2]);
      this.fogBanks.push({ x: -34 + r() * 66, y: 2 + r() * 2.6, z: -27 + r() * 17, parts, v: 0.25 + r() * 0.25 });
    }
    for (let f = 0; f < 3; f++) this.birds.push({ ph: r() * 60, off: Array.from({ length: 5 }, (_, i) => [i * 0.5 + r() * 0.3, r() * 0.5, (i % 2) * 0.6 + r() * 0.3]) });
  }

  update(t: number, dt: number) {
    const b = this.boxes;
    b.begin();
    this.mist.begin();
    const launch = this.rocket(t);
    this.updatePeople(t, dt, launch);
    this.updateCars(t, dt);
    this.cableCars(t);
    this.updateBoats(t, dt);
    this.signals(t);
    this.sky(t, dt);
    b.end();
    this.mist.end();
  }

  // ── people ──

  private updatePeople(t: number, dt: number, launch: number) {
    for (const p of this.people) {
      if (p.mode === "ring") {
        p.s += p.sign * p.speed * dt;
        ringPos(p.rect, p.s, p);
        p.moving = true;
      } else if (p.mode === "wander") {
        if (p.wait > 0) {
          p.wait -= dt;
          p.moving = false;
        } else {
          const dx = p.tx - p.x, dz = p.tz - p.z;
          const step = p.speed * dt;
          p.moving = true;
          if (Math.abs(dx) > step) (p.x += Math.sign(dx) * step), (p.alongX = true);
          else if (Math.abs(dz) > step) (p.z += Math.sign(dz) * step), (p.alongX = false);
          else {
            p.tx = p.rect.x0 + this.r() * (p.rect.x1 - p.rect.x0);
            p.tz = p.rect.z0 + this.r() * (p.rect.z1 - p.rect.z0);
            p.wait = this.r() * 4;
          }
        }
      }
      this.drawPerson(p, t, launch);
    }
  }

  private drawPerson(p: Person, t: number, excite: number) {
    const b = this.boxes;
    const sw = p.moving ? Math.sin(t * 11 * p.speed + p.ph) : 0;
    let y = p.y;
    if (p.moving) y += Math.abs(sw) * 0.035;
    else if (p.kind === "cheer") y += Math.max(0, Math.sin(t * 6 + p.ph + p.x)) * (0.03 + 0.07 * Math.max(0, Math.sin(t * 0.45 + p.z * 0.2)) + 0.12 * excite);
    else y += Math.sin(t * 1.7 + p.ph) * 0.008;
    const { x, z } = p;
    if (p.kind === "sit") {
      b.put(x - 0.14, y, z - 0.1, 0.28, 0.1, 0.34, p.pants);
      y -= 0.2;
    } else {
      const a = Math.max(0, sw) * 0.09, c = Math.max(0, -sw) * 0.09;
      if (p.alongX) {
        b.put(x - 0.07, y + a, z - 0.13, 0.14, 0.3 - a, 0.11, p.pants);
        b.put(x - 0.07, y + c, z + 0.02, 0.14, 0.3 - c, 0.11, p.pants);
      } else {
        b.put(x - 0.13, y + a, z - 0.07, 0.11, 0.3 - a, 0.14, p.pants);
        b.put(x + 0.02, y + c, z - 0.07, 0.11, 0.3 - c, 0.14, p.pants);
      }
    }
    b.put(x - 0.15, y + 0.3, z - 0.11, 0.3, 0.32, 0.22, p.shirt);
    b.put(x - 0.12, y + 0.62, z - 0.12, 0.24, 0.22, 0.24, p.skin);
    b.put(x - 0.13, y + 0.8, z - 0.13, 0.26, 0.09, 0.26, p.hair);
    if (p.bag) b.put(x - 0.19, y + 0.32, z - 0.08, 0.05, 0.24, 0.16, p.bag);
  }

  // ── traffic ──

  private updateCars(t: number, dt: number) {
    const cars = this.cars;
    for (const c of cars) place(c);
    for (const c of cars) {
      let go = true;
      // red light ahead?
      const q = c.alongX ? c.x : c.z;
      const n = c.sgn > 0 ? Math.ceil(q / 10) * 10 : Math.floor(q / 10) * 10;
      const dist = (n - q) * c.sgn;
      if (c.z > LAND0 - 2 && n >= -10 && n <= 60 && dist > 1.7 && dist < 2.4 && lightFor(c.alongX, t) !== "go") go = false;
      // anything in the way? probe a short box ahead of the bumper
      if (go && c.ghost <= 0) {
        const f = c.len / 2, reach = 0.75, hw = 0.3;
        const px0 = c.alongX ? (c.sgn > 0 ? c.x + f : c.x - f - reach) : c.x - hw, px1 = c.alongX ? px0 + reach : c.x + hw;
        const pz0 = c.alongX ? c.z - hw : c.sgn > 0 ? c.z + f : c.z - f - reach, pz1 = c.alongX ? c.z + hw : pz0 + reach;
        const hit = (ox: number, oz: number, hx: number, hz: number) => px0 < ox + hx && px1 > ox - hx && pz0 < oz + hz && pz1 > oz - hz;
        for (const o of cars) {
          if (o === c) continue;
          if (hit(o.x, o.z, o.alongX ? o.len / 2 : 0.31, o.alongX ? 0.31 : o.len / 2)) {
            go = false;
            break;
          }
        }
        for (const cx of this.cablePos(t)) if (hit(cx, 0, 1.3, 0.55)) go = false;
        c.stuck = go ? 0 : c.stuck + dt;
        if (c.stuck > 6) (c.ghost = 1.5), (c.stuck = 0); // never gridlock forever
      }
      c.ghost -= dt;
      c.v += ((go ? c.vmax : 0) - c.v) * Math.min(1, dt * 5);
      c.s += c.v * dt;
      if (!c.lane.closed && c.s > c.lane.total) c.s -= c.lane.total;
      this.drawCar(c, t);
    }
  }

  private drawCar(c: Car, t: number) {
    const b = this.boxes;
    const W = 0.62, L = c.len, bus = c.kind === "shuttle";
    const lx = c.alongX ? L : W, lz = c.alongX ? W : L;
    const x0 = c.x - lx / 2, z0 = c.z - lz / 2;
    b.put(x0, 0.12, z0, lx, 0.3, lz, c.body);
    // cabin: glass with a roof in the body color
    const inset = bus ? 0.06 : L * 0.22, cy = 0.42, ch = bus ? 0.4 : 0.25;
    const cx0 = c.alongX ? x0 + inset : x0 + 0.04, cz0 = c.alongX ? z0 + 0.04 : z0 + inset;
    const cw = c.alongX ? L - 2 * inset : W - 0.08, cd = c.alongX ? W - 0.08 : L - 2 * inset;
    b.put(cx0, cy, cz0, cw, ch, cd, K.glass);
    b.put(cx0 - 0.015, cy + ch, cz0 - 0.015, cw + 0.03, 0.05, cd + 0.03, c.body);
    if (bus) c.alongX ? b.put(x0, 0.3, z0 + lz, lx, 0.06, 0.012, K.yc) : b.put(x0 + lx, 0.3, z0, 0.012, 0.06, lz, K.yc);
    // wheels on the visible side, lights on the visible end
    const end = c.sgn > 0 ? K.lit : K.red;
    if (c.alongX) {
      b.put(x0 + 0.14, 0, z0 + lz - 0.03, 0.22, 0.2, 0.06, K.black);
      b.put(x0 + lx - 0.36, 0, z0 + lz - 0.03, 0.22, 0.2, 0.06, K.black);
      b.put(x0 + lx, 0.2, z0 + 0.06, 0.012, 0.09, 0.14, end);
      b.put(x0 + lx, 0.2, z0 + lz - 0.2, 0.012, 0.09, 0.14, end);
    } else {
      b.put(x0 + lx - 0.03, 0, z0 + 0.14, 0.06, 0.2, 0.22, K.black);
      b.put(x0 + lx - 0.03, 0, z0 + lz - 0.36, 0.06, 0.2, 0.22, K.black);
      b.put(x0 + 0.06, 0.2, z0 + lz, 0.14, 0.09, 0.012, end);
      b.put(x0 + lx - 0.2, 0.2, z0 + lz, 0.14, 0.09, 0.012, end);
    }
    const top = cy + ch + 0.05;
    if (c.kind === "taxi") b.put(c.x - 0.1, top, c.z - 0.1, 0.2, 0.08, 0.2, K.white);
    if (c.kind === "robo") b.put(c.x - 0.09, top, c.z - 0.09, 0.18, 0.13, 0.18, Math.floor(t * 5 + c.s) % 2 ? K.glassLit : K.metal); // spinning sensor
  }

  /** x of each cable car on Market Street: they shuttle between their two ends, pausing at each. */
  private cablePos(t: number): number[] {
    const shuttle = (a: number, z: number, phase: number) => {
      const run = (z - a) / 1.6, stop = 4, cycle = 2 * (run + stop);
      const p = (t + phase) % cycle;
      if (p < run) return a + p * 1.6;
      if (p < run + stop) return z;
      if (p < 2 * run + stop) return z - (p - run - stop) * 1.6;
      return a;
    };
    return [shuttle(-7.5, 15.5, 6), shuttle(19, 41, 17)];
  }

  private cableCars(t: number) {
    const b = this.boxes;
    for (const x of this.cablePos(t)) {
      b.put(x - 1.15, 0.1, -0.42, 2.3, 0.26, 0.84, K.redDark);
      b.put(x - 1.2, 0.36, -0.45, 2.4, 0.05, 0.9, K.cream);
      b.put(x - 0.5, 0.41, -0.4, 1.0, 0.6, 0.8, K.redDark);
      b.put(x - 0.42, 0.6, 0.4, 0.84, 0.3, 0.012, K.lit);
      for (const px of [-1.15, -0.56, 0.5, 1.09]) {
        b.put(x + px, 0.41, 0.36, 0.06, 0.6, 0.06, K.cream);
        b.put(x + px, 0.41, -0.42, 0.06, 0.6, 0.06, K.cream);
      }
      b.put(x - 1.22, 1.01, -0.47, 2.44, 0.08, 0.94, K.cream);
      b.put(x - 0.9, 1.09, -0.25, 1.8, 0.07, 0.5, K.creamLight);
      b.put(x + 1.15, 0.5, -0.1, 0.012, 0.12, 0.2, K.lit);
      // riders on the open ends
      for (let k = 0; k < 4; k++) {
        const p = this.people[k * 7 + Math.round(x > 17 ? 3 : 0)]!;
        const rx = x + (k < 2 ? -0.85 : 0.8), rz = k % 2 ? 0.14 : -0.16, y = 0.41;
        b.put(rx - 0.15, y, rz - 0.11, 0.3, 0.3, 0.22, p.shirt);
        b.put(rx - 0.12, y + 0.3, rz - 0.12, 0.24, 0.22, 0.24, p.skin);
        b.put(rx - 0.13, y + 0.48, rz - 0.13, 0.26, 0.08, 0.26, p.hair);
      }
    }
  }

  // ── water ──

  private updateBoats(t: number, dt: number) {
    const b = this.boxes;
    for (const s of this.boats) {
      const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
      if (d < 0.2) {
        s.tx = s.rect.x0 + this.r() * (s.rect.x1 - s.rect.x0);
        s.tz = s.rect.z0 + this.r() * (s.rect.z1 - s.rect.z0);
      } else {
        s.x += (dx / d) * 0.35 * dt;
        s.z += (dz / d) * 0.35 * dt;
      }
      const y = -0.5 + Math.sin(t * 1.6 + s.ph) * 0.03;
      b.put(s.x - 0.55, y, s.z - 0.2, 1.1, 0.2, 0.4, K.white);
      b.put(s.x - 0.4, y + 0.2, s.z - 0.14, 0.5, 0.12, 0.28, K.woodLight);
      b.put(s.x, y + 0.2, s.z - 0.02, 0.05, 1.35, 0.05, K.woodDark);
      for (let k = 0; k < 5; k++) b.put(s.x + 0.05, y + 0.36 + k * 0.22, s.z - 0.01, 0.55 - k * 0.11, 0.22, 0.03, s.sail);
    }

    // the ferry shuttles along the piers
    const run = 34, cycle = 2 * (run + 5), p = (t * 1.1) % cycle;
    const fz = p < run ? -8 + p : p < run + 5 ? 26 : p < 2 * run + 5 ? 26 - (p - run - 5) : -8;
    const fx = -21.3, fy = -0.5 + Math.sin(t * 1.3) * 0.02;
    b.put(fx - 0.5, fy, fz - 1.3, 1.0, 0.3, 2.6, K.white);
    b.put(fx - 0.5, fy + 0.1, fz + 1.3, 1.0, 0.08, 0.012, K.yc);
    b.put(fx + 0.5, fy + 0.1, fz - 1.3, 0.012, 0.08, 2.6, K.yc);
    b.put(fx - 0.42, fy + 0.3, fz - 1.0, 0.84, 0.3, 2.0, K.white);
    b.put(fx + 0.42, fy + 0.38, fz - 0.9, 0.012, 0.14, 1.8, K.glass);
    b.put(fx - 0.3, fy + 0.6, fz - 0.5, 0.6, 0.24, 0.9, K.white);
    b.put(fx - 0.1, fy + 0.84, fz - 0.1, 0.2, 0.3, 0.2, K.yc);

    // container ship crossing the bay
    const sz = ((t * 0.45 + 30) % 120) - 70, sx = -23.6, sy = -0.5;
    b.put(sx - 0.7, sy, sz - 3.2, 1.4, 0.45, 6.4, K.hull);
    b.put(sx - 0.7, sy + 0.1, sz + 3.2, 1.4, 0.08, 0.012, K.red);
    const tints = [K.yc, K.teal, K.red, K.white, K.tan, K.navy];
    for (let k = 0; k < 5; k++)
      for (let q = 0; q < 2; q++) {
        const stack = 1 + ((k * 3 + q * 5) % 2);
        for (let h = 0; h < stack; h++) b.put(sx - 0.62 + q * 0.64, sy + 0.45 + h * 0.34, sz - 2.9 + k * 0.92, 0.6, 0.34, 0.86, tints[(k + q * 2 + h * 3) % 6]!);
      }
    b.put(sx - 0.5, sy + 0.45, sz + 1.9, 1.0, 0.9, 0.8, K.white);
    b.put(sx - 0.5, sy + 1.1, sz + 2.7, 1.0, 0.12, 0.012, K.glass);

    for (const s of this.city.seaLions) {
      const bob = Math.sin(t * 1.4 + s.x * 3) * 0.02, up = Math.max(0, Math.sin(t * 0.6 + s.z * 4)) * 0.12;
      b.put(s.x, s.y + bob, s.z, 0.42, 0.18, 0.24, K.woodDark);
      b.put(s.x + 0.3, s.y + 0.1 + bob + up, s.z + 0.04, 0.16, 0.2, 0.16, K.wood);
    }
  }

  // ── lights, screens, small machines ──

  private signals(t: number) {
    const b = this.boxes, city = this.city;
    for (const w of city.twinkles) {
      const on = Math.sin(w.seed * 999 + Math.floor(t / (2.5 + w.seed * 5)) * 12.9898) * 43758.5453;
      const c = on - Math.floor(on) > 0.5 ? K.lit : K.off;
      if (w.side === "L") b.put(w.x, w.y, w.z, w.w, w.h, 0.012, c);
      else b.put(w.x, w.y, w.z, 0.012, w.h, w.w, c);
    }
    for (const k of city.blinks) if ((t * 1.1 + k.seed * 7) % 1 < 0.55) b.put(k.x, k.y, k.z, k.size, k.size, k.size, color(k.hex));

    const lamp = (state: ReturnType<typeof lightFor>) => (state === "go" ? { c: K.green, y: 0.04 } : state === "slow" ? { c: K.amber, y: 0.16 } : { c: K.red, y: 0.28 });
    const forZ = lamp(lightFor(false, t)), forX = lamp(lightFor(true, t));
    for (const l of city.lights) {
      b.put(l.x + 0.05, G + 1.25 + forZ.y, l.z + 0.19, 0.09, 0.09, 0.012, forZ.c);
      b.put(l.x + 0.19, G + 1.25 + forX.y, l.z + 0.05, 0.012, 0.09, 0.09, forX.c);
    }

    // demo-day chart: up and to the right, over and over
    const prog = ((t * 0.22) % 1.5) * 1.4;
    for (let k = 0; k < 6; k++) {
      const grow = Math.min(1, Math.max(0, prog - k * 0.14) * 3);
      const h = (0.12 + 1.45 * (k / 5) ** 2.2) * grow;
      if (h > 0.01) b.put(city.chart.x + k * 0.25, city.chart.y, city.chart.z, 0.19, h, 0.012, k === 5 ? K.white : K.yc);
    }

    for (const f of city.flags) for (let k = 0; k < 4; k++) b.put(f.x + k * 0.17, f.y + Math.sin(t * 5 - k * 0.9) * 0.04, f.z, 0.17, 0.36, 0.03, K.yc);

    for (const f of city.fountains)
      for (let k = 0; k < 10; k++) {
        const u = (t * 0.9 + k / 10) % 1, a = k * 2.4;
        b.put(f.x + Math.cos(a) * u * 0.6 - 0.04, f.y + 3.2 * u * (1 - u), f.z + Math.sin(a) * u * 0.6 - 0.04, 0.08, 0.08, 0.08, K.drop);
      }

    const w = city.wheel, tints = [K.yc, K.white, K.teal, K.red];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + t * 0.22;
      b.put(w.x + Math.cos(a) * w.r - 0.17, w.y + Math.sin(a) * w.r - 0.34, w.z + 0.04, 0.34, 0.3, 0.24, tints[k % 4]!);
    }

    for (const s of city.steam)
      for (let k = 0; k < 3; k++) {
        const u = (t * 0.35 + k / 3 + s.x) % 1, size = 0.12 + u * 0.16;
        this.mist.put(s.x - size / 2 + Math.sin(u * 5 + k) * 0.08, s.y + u * 1.2, s.z - size / 2, size, size, size, K.white);
      }
  }

  /** The rocket on the accelerator's pad: launches, then a booster lands back. Returns 0..1 excitement for the crowd. */
  private rocket(t: number): number {
    const b = this.boxes, { x, z, y: pad } = this.city.rocket;
    const p = t % 28;
    let y = pad, burn = 0;
    if (p > 15 && p <= 17) burn = 0.3; // ignition
    else if (p > 17 && p <= 23) (y = pad + 0.9 * (p - 17) ** 2), (burn = 1);
    else if (p > 23) (y = pad + 0.75 * (28 - p) ** 2), (burn = 0.6); // coming back down
    const jx = burn > 0 && y < pad + 0.3 ? Math.sin(t * 60) * 0.012 : 0;
    const rx = x + jx;
    for (const [lx, lz] of [[-0.24, -0.04], [0.16, -0.04], [-0.04, -0.24], [-0.04, 0.16]] as const) b.put(rx + lx, y, z + lz, 0.08, 0.2, 0.08, K.black);
    b.put(rx - 0.16, y + 0.14, z - 0.16, 0.32, 0.95, 0.32, K.white);
    b.put(rx - 0.165, y + 0.5, z - 0.165, 0.33, 0.09, 0.33, K.black);
    b.put(rx + 0.16, y + 0.72, z - 0.07, 0.012, 0.14, 0.14, K.glassLit);
    b.put(rx - 0.07, y + 0.72, z + 0.16, 0.14, 0.14, 0.012, K.glassLit);
    b.put(rx - 0.11, y + 1.09, z - 0.11, 0.22, 0.18, 0.22, K.yc);
    b.put(rx - 0.05, y + 1.27, z - 0.05, 0.1, 0.14, 0.1, K.yc);
    if (burn > 0) {
      const len = burn * (0.5 + Math.abs(Math.sin(t * 40)) * 0.3);
      b.put(rx - 0.1, y - len, z - 0.1, 0.2, len + 0.1, 0.2, K.yc);
      b.put(rx - 0.05, y - len * 0.6, z - 0.05, 0.1, len * 0.6 + 0.1, 0.1, K.flame);
      // exhaust clouds while it is near the ground
      if (y < pad + 6)
        for (let k = 0; k < 8; k++) {
          const u = (t * 1.3 + k / 8) % 1, a = k * 0.8, size = 0.2 + u * 0.5;
          this.mist.put(x + Math.cos(a) * u * 1.3 - size / 2, pad + u * 0.5, z + Math.sin(a) * u * 1.3 - size / 2, size, size, size, K.white);
        }
    }
    return p > 15 && p < 24 ? 1 : 0;
  }

  // ── sky ──

  private sky(t: number, dt: number) {
    const b = this.boxes;
    // the fog rolls in from the bay, around the bridge
    for (const f of this.fogBanks) {
      f.x += f.v * dt;
      if (f.x > 34) f.x = -36;
      for (const p of f.parts) this.mist.put(f.x + p[0]!, f.y + p[1]!, f.z + p[2]!, p[3]!, p[4]!, p[5]!, K.white);
    }
    // birds cross the screen left to right
    for (const flock of this.birds) {
      const u = ((t * 1.6 + flock.ph) % 80) - 40;
      const cx = u * 0.7 + 4, cz = -u * 0.7 - 6 + Math.sin(flock.ph) * 10;
      for (const o of flock.off) {
        const bx = cx - o[0]!, bz = cz + o[2]!, by = 7.5 + o[1]!, flap = Math.sin(t * 13 + o[0]! * 4) * 0.07;
        b.put(bx, by, bz, 0.14, 0.05, 0.1, K.navy);
        b.put(bx + 0.02, by + flap, bz - 0.14, 0.1, 0.03, 0.14, K.navy);
        b.put(bx + 0.02, by + flap, bz + 0.1, 0.1, 0.03, 0.14, K.navy);
      }
    }
    // a delivery drone doing its rounds over downtown
    const a = t * 0.3, dx = 5 + Math.cos(a) * 9, dz = -1 + Math.sin(a) * 7, dy = 7 + Math.sin(t * 2) * 0.1;
    b.put(dx - 0.14, dy, dz - 0.14, 0.28, 0.07, 0.28, K.black);
    for (const [ox, oz] of [[-0.24, -0.24], [0.16, -0.24], [-0.24, 0.16], [0.16, 0.16]] as const) b.put(dx + ox, dy + 0.07, dz + oz, 0.1, 0.02, 0.1, Math.floor(t * 20) % 2 ? K.metal : K.stone);
    b.put(dx - 0.09, dy - 0.2, dz - 0.09, 0.18, 0.16, 0.18, K.tan);
    if (Math.floor(t * 3) % 2) b.put(dx - 0.03, dy - 0.03, dz + 0.14, 0.06, 0.04, 0.012, K.red);
  }
}
