/**
 * The animated city behind the page. three.js with an orthographic camera at the classic isometric
 * angle (30° elevation → 2:1 tiles), rendered at a fraction of the screen resolution and scaled up
 * with nearest-neighbour, so every screen pixel block is one "art pixel".
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCity } from "./city";
import { Life } from "./life";
import { water } from "./palette";
import { artPixel } from "./scale";
import { Boxes, seeded } from "./voxel";

/** Art pixels per world unit (one tile): a tile diamond is ~20×10 art pixels, a person ~6×11. */
const UNIT_PX = 14;
const TARGET = new THREE.Vector3(0.5, 0, 0.5);
/** Camera direction for 2:1 isometric: 45° around, 30° up. */
const ISO = new THREE.Vector3(1, Math.SQRT2 * Math.tan(Math.PI / 6), 1).normalize();

const rgb = (hex: string) => new THREE.Vector3(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);

/** The bay: flat color with chunky moving highlights, computed per quarter-tile cell. */
function bay(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, deep: { value: rgb(water[0]) }, base: { value: rgb(water[1]) }, mid: { value: rgb(water[2]) }, light: { value: rgb(water[3]) } },
    vertexShader: "varying vec2 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      uniform float uT; uniform vec3 deep, base, mid, light; varying vec2 vW;
      void main() {
        vec2 p = floor(vW * 4.0) / 4.0;
        float a = sin(p.x * 1.1 + p.y * 0.7 + uT * 0.9) + sin(p.x * 0.37 - p.y * 1.3 + uT * 0.6) + 0.5 * sin((p.x - p.y) * 2.3 + uT * 1.4);
        gl_FragColor = vec4(a > 2.05 ? light : a > 1.35 ? mid : a < -1.8 ? deep : base, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.5;
  return mesh;
}

export function CityCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    const scene = new THREE.Scene();

    const rand = seeded(2026);
    const city = buildCity(rand);
    const boxes = new Boxes(12000);
    const mist = new Boxes(500, 0.62);
    const sea = bay();
    scene.add(sea, city.mesh, boxes.mesh, mist.mesh);
    const life = new Life(city, boxes, mist, rand);

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
    camera.position.copy(TARGET).addScaledVector(ISO, 200);
    camera.lookAt(TARGET);

    const resize = () => {
      const px = artPixel();
      // the canvas fills its frame, which is a little smaller than the window
      const w = Math.ceil(canvas.clientWidth / px), h = Math.ceil(canvas.clientHeight / px);
      renderer.setSize(w, h, false); // the canvas itself is stretched to the window by CSS
      camera.left = -w / 2 / UNIT_PX;
      camera.right = w / 2 / UNIT_PX;
      camera.top = h / 2 / UNIT_PX;
      camera.bottom = -h / 2 / UNIT_PX;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // People who ask for less motion get the city as a still picture.
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 9, last = performance.now(), raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      sea.material.uniforms.uT!.value = t;
      life.update(t, dt);
      renderer.render(scene, camera);
      if (!still) raf = requestAnimationFrame(frame);
    };
    if (still) for (let i = 0; i < 240; i++) life.update((t += 0.05), 0.05); // let traffic and crowds spread out first
    raf = requestAnimationFrame(frame);
    const redraw = () => still && renderer.render(scene, camera);
    window.addEventListener("resize", redraw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("resize", redraw);
      renderer.dispose();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />;
}
