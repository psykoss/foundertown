/**
 * Voxel drawing for the fixed isometric camera. The camera always looks from (+x, +y, +z), so only
 * three faces of any box can ever be seen: the top, the +z face (screen left) and the +x face (screen
 * right). Everything is drawn from those three, flat-shaded: top = the color, left a step darker,
 * right darker again — the classic isometric pixel-art look, with no lights in the scene.
 *
 * `Builder` bakes the static city into one mesh. `Boxes` is a pool of instanced boxes that the
 * animation refills every frame (people, cars, boats…).
 */
import * as THREE from "three";

/** Brightness of each visible face (applied in linear light). */
export const SHADE = { top: 1, left: 0.7, right: 0.47 } as const;

const colors = new Map<string, THREE.Color>();
export function color(hex: string): THREE.Color {
  let c = colors.get(hex);
  if (!c) colors.set(hex, (c = new THREE.Color(hex)));
  return c;
}

type V3 = readonly [number, number, number];

export class Builder {
  private pos: number[] = [];
  private rgb: number[] = [];
  /** Everything drawn is shifted by this (lets a block written for one lot be built on another). */
  dx = 0;
  dz = 0;

  /** Any flat quad (corners in order) with an explicit brightness. */
  quad(a: V3, b: V3, c: V3, d: V3, hex: string, shade: number) {
    this.tri(a, b, c, hex, shade);
    this.tri(a, c, d, hex, shade);
  }

  tri(a: V3, b: V3, c: V3, hex: string, shade: number) {
    const k = color(hex);
    for (const v of [a, b, c]) this.pos.push(v[0] + this.dx, v[1], v[2] + this.dz);
    for (let i = 0; i < 3; i++) this.rgb.push(k.r * shade, k.g * shade, k.b * shade);
  }

  /** Horizontal quad at height y. */
  top(x: number, y: number, z: number, w: number, d: number, hex: string, shade: number = SHADE.top) {
    this.quad([x, y, z], [x + w, y, z], [x + w, y, z + d], [x, y, z + d], hex, shade);
  }

  /** Vertical quad on the plane z, facing +z (drawn on the screen-left side of things). */
  left(x: number, y: number, z: number, w: number, h: number, hex: string, shade: number = SHADE.left) {
    this.quad([x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z], hex, shade);
  }

  /** Vertical quad on the plane x, facing +x (screen-right side). */
  right(x: number, y: number, z: number, d: number, h: number, hex: string, shade: number = SHADE.right) {
    this.quad([x, y, z], [x, y, z + d], [x, y + h, z + d], [x, y + h, z], hex, shade);
  }

  /** Box with its minimum corner at (x, y, z). `topHex` recolors the top face. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, hex: string, topHex: string = hex) {
    this.top(x, y + h, z, w, d, topHex);
    this.left(x, y, z + d, w, h, hex);
    this.right(x + w, y, z, d, h, hex);
  }

  mesh(): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.rgb, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    return m;
  }
}

/** Unit cube (0..1) with only the three visible faces, shaded through vertex colors. */
function unitBox(): THREE.BufferGeometry {
  const b = new Builder();
  b.box(0, 0, 0, 1, 1, 1, "#ffffff");
  return b.mesh().geometry;
}

export class Boxes {
  readonly mesh: THREE.InstancedMesh;
  private n = 0;
  private m = new THREE.Matrix4();

  constructor(private max: number, opacity = 1) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
    this.mesh = new THREE.InstancedMesh(unitBox(), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, color("#ffffff")); // allocates the per-instance color buffer
    this.mesh.count = 0;
  }

  begin() {
    this.n = 0;
  }

  /** Box with its minimum corner at (x, y, z). */
  put(x: number, y: number, z: number, w: number, h: number, d: number, c: THREE.Color) {
    if (this.n >= this.max) return;
    this.m.makeScale(w, h, d).setPosition(x, y, z);
    this.mesh.setMatrixAt(this.n, this.m);
    this.mesh.setColorAt(this.n++, c);
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Small seeded generator, so the city is the same on every visit. */
export type Rand = () => number;
export function seeded(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
