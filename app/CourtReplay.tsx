'use client';

/*
 * Section "3D replay" (présentation / marketing).
 * - Terrain de padel 3D (scène portée depuis l'artifact "HeroScore Real Replay").
 * - Rallye entièrement chorégraphié (app/rallySim.ts) : aucune donnée réelle.
 * - Effets : bloom, balle lumineuse + traînée, rebonds (ondes), balles contre la vitre, swing de raquette,
 *   nom du coup + vitesse, score en direct, heatmap, traces, carte des rebonds.
 * - Scroll : la carte s'incline puis se pose ; en mode Cinematic la caméra suit le scroll (vue du dessus → gros plan).
 */

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildSim, OVERHEAD, teamOf, type Sim } from './rallySim';

const BLUE = 0x1e3a8a;
const BLUE_LIGHT = 0x5b8cff;
const TEAM_SHIRT = [0xf2f4f7, BLUE];
const TEAM_RING = [0xffffff, BLUE_LIGHT];
const TEAM_NAME = ['White', 'Blue'];

const VIEWS = {
  broadcast: { th: 0, ph: 1.05, r: 31 },
  top: { th: 0, ph: 0.05, r: 36 },
  side: { th: Math.PI / 2, ph: 1.14, r: 27 },
} as const;
type ViewName = 'cinematic' | keyof typeof VIEWS;
const VIEW_LABELS: [ViewName, string][] = [
  ['cinematic', 'Cinematic'],
  ['broadcast', 'Broadcast'],
  ['top', 'Top'],
  ['side', 'Side'],
];
type LayerName = 'heat' | 'trails' | 'bounces';
const LAYER_LABELS: [LayerName, string][] = [
  ['heat', 'Heatmap'],
  ['trails', 'Player trails'],
  ['bounces', 'Bounce map'],
];

// Caméra cinématique : keyframes le long de la progression du scroll (0 → 1).
const KEYS = [
  { p: 0.0, th: -0.5, ph: 0.12, r: 40 },
  { p: 0.3, th: 0, ph: 0.95, r: 32 },
  { p: 0.6, th: 0.55, ph: 1.28, r: 22 },
  { p: 1.0, th: 0.95, ph: 1.2, r: 14 },
];

const FEATURES: { title: string; text: string; soon?: boolean }[] = [
  { title: 'Ball & bounces', text: 'Every bounce mapped on the court, including balls off the glass.' },
  { title: 'Shot type & speed', text: 'Serve, volley, lob, bandeja, víbora or smash, with ball speed.', soon: true },
  { title: 'Live score', text: 'Points counted automatically from the rally.', soon: true },
  { title: 'Movement', text: 'Distance and speed per player, heatmaps and trails.' },
  { title: 'Any angle', text: 'Broadcast, top or side view, or drag to orbit the court.' },
];

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function camAt(p: number) {
  let i = 0;
  while (i < KEYS.length - 2 && p > KEYS[i + 1].p) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smooth(clamp((p - a.p) / (b.p - a.p)));
  return { th: lerp(a.th, b.th, t), ph: lerp(a.ph, b.ph, t), r: lerp(a.r, b.r, t), follow: clamp((p - 0.6) / 0.4) };
}

export default function CourtReplay() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const chipRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const scoreRefs = useRef<(HTMLElement | null)[]>([]);
  const rallyRef = useRef<HTMLParagraphElement>(null);
  const shotRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewName | 'free'>('cinematic');
  const layersRef = useRef<Record<LayerName, boolean>>({ heat: false, trails: false, bounces: true });
  const [view, setView] = useState<ViewName | 'free'>('cinematic');
  const [layers, setLayers] = useState<Record<LayerName, boolean>>(layersRef.current);
  const [near, setNear] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickView = (v: ViewName) => {
    viewRef.current = v;
    setView(v);
  };
  const toggleLayer = (l: LayerName) => {
    layersRef.current = { ...layersRef.current, [l]: !layersRef.current[l] };
    setLayers(layersRef.current);
  };

  // Charge la scène seulement quand la section approche de l'écran.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: '800px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return;
    const section = sectionRef.current!, card = cardRef.current!, stage = stageRef.current!, canvas = canvasRef.current!;
    let disposed = false;
    let raf = 0;
    let visible = true;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.innerWidth >= 768;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      setError('3D needs WebGL, which this browser has turned off.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = desktop;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    const fog = new THREE.Fog(0x000000, 38, 90);
    scene.fog = fog;
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);

    // Bloom (lueur) sur ordinateur uniquement.
    let composer: EffectComposer | null = null;
    let bloom: UnrealBloomPass | null = null;
    if (desktop) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.4, 0.92);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }

    const M = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadow;
      return m;
    };

    /* ---------- environnement nocturne pour les reflets ---------- */
    {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 256;
      const g = c.getContext('2d')!;
      g.fillStyle = '#020305';
      g.fillRect(0, 0, 512, 256);
      [[70, 60], [200, 52], [320, 60], [450, 52]].forEach(([x, y]) => {
        const r = g.createRadialGradient(x, y, 0, x, y, 34);
        r.addColorStop(0, 'rgba(255,255,255,1)');
        r.addColorStop(0.3, 'rgba(220,235,255,.7)');
        r.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = r;
        g.fillRect(x - 40, y - 40, 80, 80);
      });
      const t = new THREE.CanvasTexture(c);
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(renderer);
      scene.environment = pm.fromEquirectangular(t).texture;
      t.dispose();
      pm.dispose();
    }

    /* ---------- projecteurs ---------- */
    scene.add(new THREE.HemisphereLight(0x8fa8c8, 0x05070a, 0.3 * Math.PI));
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d')!;
      const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,255,255,1)');
      r.addColorStop(0.25, 'rgba(210,228,255,.55)');
      r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r;
      g.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    })();
    const steel = new THREE.MeshStandardMaterial({ color: 0x1b2026, metalness: 0.8, roughness: 0.45 });
    (
      [
        [6.7, 5.5, true],
        [-6.7, 5.5, false],
        [6.7, -5.5, false],
        [-6.7, -5.5, true],
      ] as [number, number, boolean][]
    ).forEach(([x, z, shadow]) => {
      const pole = M(new THREE.CylinderGeometry(0.07, 0.09, 8, 10), steel, false);
      pole.position.set(x, 4, z);
      scene.add(pole);
      const head = M(new THREE.BoxGeometry(0.5, 0.12, 1.3), new THREE.MeshBasicMaterial({ color: 0xffffff }), false);
      head.position.set(x - Math.sign(x) * 0.3, 8, z);
      scene.add(head);
      const gl = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: desktop ? 0.45 : 0.9, fog: false })
      );
      gl.scale.set(3.4, 3.4, 1);
      gl.position.copy(head.position);
      scene.add(gl);
      const sp = new THREE.SpotLight(0xf2f6ff, 0.95 * Math.PI, 0, 1.0, 0.55, 0);
      sp.position.set(x, 8, z);
      sp.target.position.set(-x * 0.15, 0, z * 0.25);
      scene.add(sp, sp.target);
      if (shadow && desktop) {
        sp.castShadow = true;
        sp.shadow.mapSize.set(1024, 1024);
        sp.shadow.camera.near = 2;
        sp.shadow.camera.far = 32;
        sp.shadow.bias = -0.0008;
        sp.shadow.radius = 3;
      }
    });

    /* ---------- terrain (10 × 20 m), lignes légèrement lumineuses ---------- */
    const courtCanvas = (base: string, noise: boolean) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 1024;
      const g = c.getContext('2d')!;
      const k = 51.2;
      g.fillStyle = base;
      g.fillRect(0, 0, 512, 1024);
      if (noise)
        for (let i = 0; i < 26000; i++) {
          g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.04)' : 'rgba(0,8,30,.08)';
          g.fillRect(Math.random() * 512, Math.random() * 1024, 1.6, 1.6);
        }
      g.fillStyle = 'rgba(255,255,255,.93)';
      const hl = (z: number) => g.fillRect(0, (z + 10) * k - 1.5, 512, 3);
      hl(6.95);
      hl(-6.95);
      g.fillRect(256 - 1.5, (10 - 6.95) * k, 3, 13.9 * k);
      g.fillRect(0, 0, 512, 3);
      g.fillRect(0, 1021, 512, 3);
      g.fillRect(0, 0, 3, 1024);
      g.fillRect(509, 0, 3, 1024);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    };
    const floor = M(
      new THREE.PlaneGeometry(10, 20),
      new THREE.MeshStandardMaterial({
        map: courtCanvas('#173a72', true),
        emissive: 0xffffff,
        emissiveMap: courtCanvas('#000000', false),
        emissiveIntensity: 0.12,
        roughness: 0.9,
        metalness: 0,
        envMapIntensity: 0.15,
      }),
      false
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const ground = M(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x0b0d11, roughness: 1, envMapIntensity: 0 }), false);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    scene.add(ground);
    const curb = M(new THREE.BoxGeometry(10.3, 0.1, 20.3), new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.8 }), false);
    curb.position.y = -0.055;
    scene.add(curb);

    const gridLines = (w: number, h: number, step: number, color: number, op: number) => {
      const v: number[] = [];
      for (let x = -w / 2; x <= w / 2 + 1e-6; x += step) v.push(x, 0, 0, x, h, 0);
      for (let y = 0; y <= h + 1e-6; y += step) v.push(-w / 2, y, 0, w / 2, y, 0);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: op }));
    };
    const glassMat = desktop
      ? new THREE.MeshPhysicalMaterial({ color: 0xdcefff, roughness: 0.04, metalness: 0, transmission: 0.96, transparent: true, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3 })
      : new THREE.MeshStandardMaterial({ color: 0xdcefff, roughness: 0.1, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false });
    const glass = (w: number, h: number, x: number, z: number, ry: number) => {
      const m = M(new THREE.PlaneGeometry(w - 0.06, h - 0.04), glassMat, false);
      m.position.set(x, h / 2, z);
      m.rotation.y = ry;
      m.renderOrder = 3;
      scene.add(m);
    };
    const post = (x: number, z: number, h: number) => {
      const p = M(new THREE.BoxGeometry(0.07, h, 0.07), steel);
      p.position.set(x, h / 2, z);
      scene.add(p);
    };
    const rail = (w: number, x: number, y: number, z: number, ry: number) => {
      const r = M(new THREE.BoxGeometry(w, 0.05, 0.05), steel, false);
      r.position.set(x, y, z);
      r.rotation.y = ry;
      scene.add(r);
    };
    const fence = (w: number, h: number, x: number, y: number, z: number, ry: number) => {
      const f = gridLines(w, h, 0.2, 0x9aa6b5, 0.2);
      f.position.set(x, y, z);
      f.rotation.y = ry;
      scene.add(f);
    };
    [1, -1].forEach((s) => {
      for (let i = 0; i < 5; i++) glass(2, 3, -4 + i * 2, 10 * s, 0);
      for (let i = 0; i <= 5; i++) post(-5 + i * 2, 10 * s, 4);
      fence(10, 1, 0, 3, 10 * s, 0);
      rail(10, 0, 3, 10 * s, 0);
      rail(10, 0, 4, 10 * s, 0);
      [1, -1].forEach((e) => {
        glass(2, 3, 5 * e, 9 * s, Math.PI / 2);
        glass(2, 2, 5 * e, 7 * s, Math.PI / 2);
        fence(2, 1, 5 * e, 3, 9 * s, Math.PI / 2);
        fence(2, 1, 5 * e, 2, 7 * s, Math.PI / 2);
        post(5 * e, 8 * s, 4);
        post(5 * e, 6 * s, 3);
        rail(2, 5 * e, 4, 9 * s, Math.PI / 2);
        rail(2, 5 * e, 3, 7 * s, Math.PI / 2);
      });
    });
    [1, -1].forEach((e) => {
      fence(12, 3, 5 * e, 0, 0, Math.PI / 2);
      rail(12, 5 * e, 3, 0, Math.PI / 2);
      [-4, -2, 2, 4].forEach((z) => post(5 * e, z, 3));
    });
    scene.add(gridLines(10, 0.88, 0.075, 0x0c0f13, 0.75));
    const netFill = M(new THREE.PlaneGeometry(10, 0.88), new THREE.MeshBasicMaterial({ color: 0x05070a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }), false);
    netFill.position.y = 0.44;
    scene.add(netFill);
    const tape = M(new THREE.BoxGeometry(10, 0.07, 0.035), new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.7 }));
    tape.position.y = 0.9;
    scene.add(tape);
    [5.02, -5.02].forEach((x) => {
      const p = M(new THREE.CylinderGeometry(0.05, 0.05, 0.98, 10), steel);
      p.position.set(x, 0.49, 0);
      scene.add(p);
    });

    /* ---------- heatmap ---------- */
    const heatC = document.createElement('canvas');
    heatC.width = 100;
    heatC.height = 200;
    const hg = heatC.getContext('2d')!;
    const heatTex = new THREE.CanvasTexture(heatC);
    const heat = M(new THREE.PlaneGeometry(10, 20), new THREE.MeshBasicMaterial({ map: heatTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), false);
    heat.rotation.x = -Math.PI / 2;
    heat.position.y = 0.006;
    scene.add(heat);
    const heatDot = (x: number, z: number, team: number) => {
      const cx = (x + 5) * 10, cy = (z + 10) * 10;
      const r = hg.createRadialGradient(cx, cy, 0, cx, cy, 11);
      r.addColorStop(0, team ? 'rgba(70,120,240,.18)' : 'rgba(200,215,255,.1)');
      r.addColorStop(1, 'rgba(0,0,0,0)');
      hg.fillStyle = r;
      hg.fillRect(cx - 11, cy - 11, 22, 22);
    };
    const trailGroup = new THREE.Group();
    scene.add(trailGroup);

    /* ---------- joueurs articulés ---------- */
    const HIP = 0.98;
    const seg = (len: number, r0: number, r1: number, mat: THREE.Material) => {
      const m = M(new THREE.CylinderGeometry(r0, r1, len, 10), mat);
      m.position.y = -len / 2;
      return m;
    };
    const ballJ = (r: number, mat: THREE.Material) => M(new THREE.SphereGeometry(r, 10, 8), mat);
    const LOOKS = [
      { skin: 0xd9a47c, hair: 0x1c1410, h: 1.0, cap: false },
      { skin: 0x9c6a47, hair: 0x0d0b0a, h: 1.04, cap: true },
      { skin: 0xe6b995, hair: 0x5a3a1c, h: 0.97, cap: true },
      { skin: 0xc48a5f, hair: 0x15110e, h: 1.02, cap: false },
    ];
    type Arm = { sh: THREE.Group; el: THREE.Group };
    type Leg = { hip: THREE.Group; knee: THREE.Group; foot: THREE.Group };
    type Rig = { root: THREE.Group; hips: THREE.Group; torso: THREE.Group; head: THREE.Group; aL: Arm; aR: Arm; lL: Leg; lR: Leg; ring: THREE.Mesh };

    const buildPlayer = (team: number, look: (typeof LOOKS)[number]): Rig => {
      const shirt = new THREE.MeshStandardMaterial({ color: TEAM_SHIRT[team], roughness: 0.75 });
      const shorts = new THREE.MeshStandardMaterial({ color: team ? 0xf1f3f5 : 0x15171c, roughness: 0.8 });
      const skin = new THREE.MeshStandardMaterial({ color: look.skin, roughness: 0.65 });
      const hairM = new THREE.MeshStandardMaterial({ color: look.hair, roughness: 0.9 });
      const shoeM = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 });
      const sock = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
      const carbon = new THREE.MeshStandardMaterial({ color: 0x121417, roughness: 0.35, metalness: 0.3 });
      const root = new THREE.Group(), hips = new THREE.Group();
      hips.position.y = HIP;
      root.add(hips);
      const pelvis = M(new THREE.CylinderGeometry(0.155, 0.14, 0.2, 12), shorts);
      pelvis.scale.z = 0.78;
      pelvis.position.y = -0.02;
      hips.add(pelvis);
      const torso = new THREE.Group();
      torso.position.y = 0.06;
      hips.add(torso);
      const chest = M(new THREE.CylinderGeometry(0.165, 0.138, 0.46, 14), shirt);
      chest.scale.set(1.2, 1, 0.72);
      chest.position.y = 0.24;
      torso.add(chest);
      const yoke = M(new THREE.SphereGeometry(0.17, 14, 10), shirt);
      yoke.scale.set(1.28, 0.45, 0.72);
      yoke.position.y = 0.46;
      torso.add(yoke);
      const neck = M(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), skin);
      neck.position.y = 0.54;
      torso.add(neck);
      const head = new THREE.Group();
      head.position.y = 0.67;
      torso.add(head);
      const skull = M(new THREE.SphereGeometry(0.105, 18, 14), skin);
      skull.scale.set(0.94, 1.12, 1);
      head.add(skull);
      const hair = M(new THREE.SphereGeometry(0.111, 18, 12, 0, Math.PI * 2, 0, 1.75), hairM);
      hair.scale.set(0.96, 1.13, 1.02);
      hair.rotation.x = -0.38;
      head.add(hair);
      if (look.cap) {
        const cap = M(new THREE.SphereGeometry(0.113, 18, 10, 0, Math.PI * 2, 0, 1.25), shirt);
        cap.scale.set(0.97, 1.1, 1.03);
        cap.rotation.x = -0.12;
        head.add(cap);
        const visor = M(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), shirt);
        visor.position.set(0, 0.035, 0.085);
        visor.rotation.y = Math.PI / 2;
        head.add(visor);
      }
      const arm = (sgn: number): Arm => {
        const sh = new THREE.Group();
        sh.position.set(sgn * 0.215, 0.43, 0);
        torso.add(sh);
        sh.add(ballJ(0.062, shirt));
        sh.add(seg(0.14, 0.058, 0.052, shirt));
        sh.add(seg(0.29, 0.044, 0.037, skin));
        const el = new THREE.Group();
        el.position.y = -0.29;
        sh.add(el);
        el.add(ballJ(0.038, skin));
        el.add(seg(0.26, 0.037, 0.029, skin));
        const hand = ballJ(0.04, skin);
        hand.position.y = -0.28;
        el.add(hand);
        return { sh, el };
      };
      const leg = (sgn: number): Leg => {
        const hip = new THREE.Group();
        hip.position.set(sgn * 0.088, -0.04, 0);
        hips.add(hip);
        hip.add(seg(0.25, 0.088, 0.074, shorts));
        hip.add(seg(0.44, 0.07, 0.052, skin));
        const knee = new THREE.Group();
        knee.position.y = -0.44;
        hip.add(knee);
        knee.add(ballJ(0.053, skin));
        knee.add(seg(0.42, 0.05, 0.036, skin));
        const sk = M(new THREE.CylinderGeometry(0.04, 0.039, 0.11, 10), sock);
        sk.position.y = -0.37;
        knee.add(sk);
        const foot = new THREE.Group();
        foot.position.y = -0.43;
        knee.add(foot);
        const shoe = M(new THREE.BoxGeometry(0.095, 0.075, 0.26), shoeM);
        shoe.position.set(0, -0.03, 0.06);
        foot.add(shoe);
        const sole = M(new THREE.BoxGeometry(0.1, 0.02, 0.27), shirt, false);
        sole.position.set(0, -0.065, 0.06);
        foot.add(sole);
        return { hip, knee, foot };
      };
      const aL = arm(1), aR = arm(-1), lL = leg(1), lR = leg(-1);
      const rk = new THREE.Group();
      rk.position.y = -0.3;
      aR.el.add(rk);
      rk.add(seg(0.15, 0.017, 0.017, carbon));
      const hg2 = new THREE.CylinderGeometry(0.118, 0.118, 0.036, 22);
      hg2.rotateX(Math.PI / 2);
      const face = M(hg2, carbon);
      face.scale.y = 1.2;
      face.position.y = -0.27;
      rk.add(face);
      const rim = M(new THREE.TorusGeometry(0.118, 0.014, 8, 26), shirt);
      rim.scale.y = 1.2;
      rim.position.y = -0.27;
      rk.add(rim);
      root.scale.setScalar(look.h);
      const ring = M(
        new THREE.RingGeometry(0.46, 0.52, 36),
        new THREE.MeshBasicMaterial({ color: TEAM_RING[team], side: THREE.DoubleSide, transparent: true, opacity: 0.85, toneMapped: false }),
        false
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      root.add(ring);
      scene.add(root);
      return { root, hips, torso, head, aL, aR, lL, lR, ring };
    };
    const setLeg = (L: Leg, s: number, c: number, cr: number, amp: number) => {
      L.hip.rotation.x = -cr - s * 0.75 * amp;
      L.knee.rotation.x = 2 * cr + Math.max(0, c) * 1.25 * amp;
      L.foot.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * 0.8;
    };
    // pose de course + swing de raquette autour de l'instant de frappe
    const pose = (R: Rig, x: number, z: number, yaw: number, ph: number, amp: number, swing: { u: number; over: boolean } | null) => {
      R.root.position.set(x, 0, z);
      R.root.rotation.y = yaw;
      const s = Math.sin(ph), c = Math.cos(ph), cr = 0.3 * (1 - amp) + 0.08;
      setLeg(R.lL, s, c, cr, amp);
      setLeg(R.lR, -s, -c, cr, amp);
      R.hips.position.y = HIP - 0.87 * (1 - Math.cos(cr)) + Math.abs(s) * 0.035 * amp;
      R.torso.rotation.x = 0.14 + 0.1 * amp;
      const twist = s * 0.12 * amp;
      R.aL.sh.rotation.x = s * 0.7 * amp - 0.15 * (1 - amp);
      R.aL.sh.rotation.z = 0.14;
      R.aL.el.rotation.x = -0.75 - 0.4 * amp;
      R.aR.sh.rotation.x = -0.5 - s * 0.35 * amp;
      R.aR.sh.rotation.z = -0.18;
      R.aR.el.rotation.x = -1.2;
      R.torso.rotation.y = twist;
      R.head.rotation.y = -twist * 0.7;
      if (!swing) return;
      const u = clamp(swing.u), env = Math.sin(Math.PI * u);
      if (swing.over) {
        R.aR.sh.rotation.x = lerp(R.aR.sh.rotation.x, -3.0 + 2.2 * u, env);
        R.aR.sh.rotation.z = lerp(R.aR.sh.rotation.z, -0.25, env);
        R.aR.el.rotation.x = lerp(R.aR.el.rotation.x, -1.3 + 1.2 * u, env);
        R.aL.sh.rotation.x = lerp(R.aL.sh.rotation.x, -2.3, env * 0.8);
        R.torso.rotation.x = lerp(R.torso.rotation.x, -0.15 + 0.5 * u, env);
      } else {
        R.torso.rotation.y = lerp(R.torso.rotation.y, 1.0 - 1.9 * u, env);
        R.aR.sh.rotation.z = lerp(R.aR.sh.rotation.z, -1.25, env);
        R.aR.sh.rotation.x = lerp(R.aR.sh.rotation.x, -0.2, env);
        R.aR.el.rotation.x = lerp(R.aR.el.rotation.x, -0.35, env);
      }
    };

    /* ---------- balle lumineuse + traînée + ombre ---------- */
    const ball = M(new THREE.SphereGeometry(0.07, 18, 14), new THREE.MeshStandardMaterial({ color: 0xf6ffd6, emissive: 0xeaffa0, emissiveIntensity: 1.6, roughness: 0.4 }));
    scene.add(ball);
    const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xeef6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    ballGlow.scale.set(0.8, 0.8, 1);
    scene.add(ballGlow);
    const ballShadow = M(new THREE.CircleGeometry(0.09, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }), false);
    ballShadow.rotation.x = -Math.PI / 2;
    scene.add(ballShadow);
    const TRAIL_N = 18;
    const trailPos = new Float32Array(TRAIL_N * 3), trailCol = new Float32Array(TRAIL_N * 3);
    const ballTrailGeo = new THREE.BufferGeometry();
    ballTrailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
    ballTrailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
    const ballTrail = new THREE.Line(ballTrailGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    ballTrail.frustumCulled = false;
    scene.add(ballTrail);
    const trailHist: THREE.Vector3[] = [];

    /* ---------- ondes (rebonds, vitre, frappes) ---------- */
    type Ripple = { mesh: THREE.Mesh; t0: number; dur: number; size: number };
    const ripples: Ripple[] = [];
    const rippleGeo = new THREE.RingGeometry(0.86, 1.0, 48);
    for (let i = 0; i < 10; i++) {
      const mesh = M(rippleGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }), false);
      mesh.visible = false;
      scene.add(mesh);
      ripples.push({ mesh, t0: -99, dur: 1, size: 1 });
    }
    let rippleIdx = 0;
    const spawnRipple = (now: number, x: number, y: number, z: number, wall: boolean, color: number, size: number, dur: number) => {
      const r = ripples[rippleIdx++ % ripples.length];
      r.mesh.position.set(x, y, z);
      r.mesh.rotation.set(wall ? 0 : -Math.PI / 2, 0, 0);
      (r.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
      r.t0 = now;
      r.dur = dur;
      r.size = size;
      r.mesh.visible = true;
    };
    // carte des rebonds (points persistants)
    const dotGeo = new THREE.CircleGeometry(0.11, 18);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
    const bounceGroup = new THREE.Group();
    scene.add(bounceGroup);
    const addDot = (x: number, z: number) => {
      const d = new THREE.Mesh(dotGeo, dotMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.012, z);
      bounceGroup.add(d);
    };

    /* ---------- rallye chorégraphié ---------- */
    const sim: Sim = buildSim(60);
    const rigs = [0, 1, 2, 3].map((i) => buildPlayer(teamOf(i), LOOKS[i]));
    const pre = rigs.map((_, i) => {
      const ph: number[] = [], amp: number[] = [], dist: number[] = [], kmh: number[] = [];
      let acc = 0, a = 0, d = 0, v = 0;
      for (let f = 0; f < sim.n; f++) {
        let step = 0;
        if (f > 0) step = Math.hypot(sim.px[i][f] - sim.px[i][f - 1], sim.pz[i][f] - sim.pz[i][f - 1]);
        acc += step;
        d += step;
        a += (clamp((step * sim.fps) / 4.2) - a) * 0.25;
        v += (step * sim.fps * 3.6 - v) * 0.1;
        ph.push(acc * 4.2);
        amp.push(a);
        dist.push(d);
        kmh.push(v);
      }
      // traces au sol (tout le rallye)
      const pts: number[] = [];
      for (let f = 0; f < sim.n; f += 3) pts.push(sim.px[i][f], 0.02, sim.pz[i][f]);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      trailGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: TEAM_RING[teamOf(i)], transparent: true, opacity: 0.35, toneMapped: false })));
      return { ph, amp, dist, kmh };
    });
    const hitsBy = rigs.map((_, i) => sim.hits.filter((h) => h.player === i));

    let lastHeat = -1;
    let heatLast: [number, number][] = [0, 1, 2, 3].map(() => [99, 99]);
    let evHit = 0, evBounce = 0, evWall = 0, evPoint = 0, evStart = 0;
    let shotsInRally = 0, fastest = 0;
    let shotUntil = -1, shotPlayer = -1, pointUntil = -1;
    const resetLoop = () => {
      hg.clearRect(0, 0, 100, 200);
      heatTex.needsUpdate = true;
      lastHeat = -1;
      heatLast = [0, 1, 2, 3].map(() => [99, 99]);
      while (bounceGroup.children.length) bounceGroup.remove(bounceGroup.children[0]);
      evHit = evBounce = evWall = evPoint = evStart = 0;
      scoreRefs.current.forEach((el) => el && (el.textContent = '0'));
    };

    const ballNow = new THREE.Vector3();
    let ballOn = false;
    const renderFrame = (t: number, now: number) => {
      const f = Math.min(sim.n - 2, Math.floor(t * sim.fps)), f1 = f + 1, k = t * sim.fps - f;

      // événements du rallye
      while (evStart < sim.pointStarts.length && sim.pointStarts[evStart] <= t) {
        shotsInRally = 0;
        fastest = 0;
        evStart++;
      }
      while (evHit < sim.hits.length && sim.hits[evHit].t <= t) {
        const h = sim.hits[evHit++];
        shotsInRally++;
        fastest = Math.max(fastest, h.kmh);
        shotPlayer = h.player;
        shotUntil = now + 1.5;
        if (shotRef.current) {
          shotRef.current.textContent = `${h.type} · ${h.kmh} km/h`;
          shotRef.current.className = shotClass(teamOf(h.player));
        }
        const rp = rigs[h.player].root.position;
        spawnRipple(now, rp.x, 0.02, rp.z, false, TEAM_RING[teamOf(h.player)], 1.4, 0.7);
      }
      while (evBounce < sim.bounces.length && sim.bounces[evBounce].t <= t) {
        const b = sim.bounces[evBounce++];
        spawnRipple(now, b.x, 0.02, b.z, false, 0x9fc0ff, 0.9, 0.9);
        addDot(b.x, b.z);
      }
      while (evWall < sim.walls.length && sim.walls[evWall].t <= t) {
        const w = sim.walls[evWall++];
        spawnRipple(now, w.x, w.y, w.z * 0.995, true, 0xffffff, 0.8, 0.8);
      }
      while (evPoint < sim.points.length && sim.points[evPoint].t <= t) {
        const p = sim.points[evPoint++];
        scoreRefs.current[0] && (scoreRefs.current[0].textContent = p.score[0]);
        scoreRefs.current[1] && (scoreRefs.current[1].textContent = p.score[1]);
        pointUntil = now + 2.2;
        if (pointRef.current) pointRef.current.textContent = `Point · Team ${TEAM_NAME[p.winner]}`;
      }
      if (rallyRef.current) rallyRef.current.textContent = `Rally · ${shotsInRally} shots${fastest ? ` · fastest ${fastest} km/h` : ''}`;

      // joueurs
      for (let i = 0; i < 4; i++) {
        const P = pre[i];
        const x = lerp(sim.px[i][f], sim.px[i][f1], k), z = lerp(sim.pz[i][f], sim.pz[i][f1], k);
        const teamA = teamOf(i) === 0;
        // regarde vers la balle (ou vers le filet)
        const tx = ballOn ? ballNow.x : 0, tz = ballOn ? ballNow.z : 0;
        const toward = Math.atan2(tx - x, tz - z);
        const base = teamA ? Math.PI : 0;
        let dy = toward - base;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const yaw = base + clamp(dy, -0.6, 0.6);
        let swing: { u: number; over: boolean } | null = null;
        for (const h of hitsBy[i]) {
          const u = (t - (h.t - 0.35)) / 0.6;
          if (u >= 0 && u <= 1) {
            swing = { u, over: OVERHEAD.has(h.type) };
            break;
          }
        }
        pose(rigs[i], x, z, yaw, lerp(P.ph[f], P.ph[f1], k), P.amp[f], swing);
        const chip = chipRefs.current[i];
        if (chip) chip.textContent = `${Math.round(P.kmh[f])} km/h · ${Math.round(P.dist[f])} m`;
      }
      if (f > lastHeat) {
        // un point de chaleur tous les 30 cm parcourus (un joueur immobile ne "brûle" pas la carte)
        for (let q = lastHeat + 1; q <= f; q++)
          for (let i = 0; i < 4; i++) {
            const x = sim.px[i][q], z = sim.pz[i][q];
            if (Math.hypot(x - heatLast[i][0], z - heatLast[i][1]) < 0.3) continue;
            heatLast[i] = [x, z];
            heatDot(x, z, teamOf(i));
          }
        lastHeat = f;
        heatTex.needsUpdate = true;
      }

      // balle
      ballOn = sim.bon[f] === 1 && sim.bon[f1] === 1;
      ball.visible = ballGlow.visible = ballShadow.visible = ballTrail.visible = ballOn;
      if (ballOn) {
        ballNow.set(lerp(sim.bx[f], sim.bx[f1], k), lerp(sim.by[f], sim.by[f1], k), lerp(sim.bz[f], sim.bz[f1], k));
        ball.position.copy(ballNow);
        ballGlow.position.copy(ballNow);
        ballShadow.position.set(ballNow.x, 0.012, ballNow.z);
        const sc = 1 - clamp(ballNow.y / 4) * 0.5;
        ballShadow.scale.setScalar(sc);
        (ballShadow.material as THREE.MeshBasicMaterial).opacity = 0.45 * sc;
        trailHist.unshift(ballNow.clone());
        if (trailHist.length > TRAIL_N) trailHist.length = TRAIL_N;
      } else trailHist.length = 0;
      for (let i = 0; i < TRAIL_N; i++) {
        const p = trailHist[Math.min(i, trailHist.length - 1)] ?? ballNow;
        trailPos.set([p.x, p.y, p.z], i * 3);
        const a = (1 - i / TRAIL_N) * 0.9;
        trailCol.set([a, a, a * 1.1], i * 3);
      }
      ballTrailGeo.attributes.position.needsUpdate = true;
      ballTrailGeo.attributes.color.needsUpdate = true;

      // ondes
      ripples.forEach((r) => {
        if (!r.mesh.visible) return;
        const u = (now - r.t0) / r.dur;
        if (u >= 1) {
          r.mesh.visible = false;
          return;
        }
        r.mesh.scale.setScalar(r.size * (0.15 + 0.85 * smooth(u)));
        (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
      });
      // anneau du frappeur plus lumineux
      rigs.forEach((R, i) => {
        const m = R.ring.material as THREE.MeshBasicMaterial;
        m.opacity = i === shotPlayer && now < shotUntil ? 1 : 0.6;
      });
    };

    /* ---------- taille ---------- */
    let SW = 1, SH = 1;
    const resize = () => {
      SW = stage.clientWidth;
      SH = stage.clientHeight;
      renderer.setSize(SW, SH, false);
      composer?.setSize(SW, SH);
      bloom?.setSize(SW, SH);
      camera.aspect = SW / SH;
      camera.fov = camera.aspect < 1 ? 52 : 34;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    resize();

    /* ---------- caméra + glisser pour tourner ---------- */
    const clock = new THREE.Clock();
    const tmpv = new THREE.Vector3();
    const camPos = new THREE.Vector3(0, 40, 2), camLook = new THREE.Vector3(0, 1, 0);
    const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
    const orbit = { th: 0, ph: 1.05, r: 31 };
    let dragging = false, lx = 0, ly = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lx = e.clientX;
      ly = e.clientY;
      if (viewRef.current !== 'free') {
        const sph = new THREE.Spherical().setFromVector3(camPos.clone().sub(camLook));
        orbit.th = sph.theta;
        orbit.ph = sph.phi;
        orbit.r = sph.radius / clamp(1.5 / camera.aspect, 1, 1.7);
        viewRef.current = 'free';
        setView('free');
      }
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      orbit.th -= (e.clientX - lx) * 0.007;
      orbit.ph = clamp(orbit.ph - (e.clientY - ly) * 0.005, 0.02, 1.5);
      lx = e.clientX;
      ly = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    let t = reduced ? sim.hits[4]?.t ?? 5 : 0;
    let now = 0;
    let first = true;
    resetLoop();

    const loop = () => {
      raf = 0;
      if (disposed || !visible) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      now += dt;
      if (!reduced) {
        t += dt;
        if (t >= sim.duration - 0.05) {
          t = 0;
          resetLoop();
        }
      }
      renderFrame(t, now);
      heat.visible = layersRef.current.heat;
      trailGroup.visible = layersRef.current.trails;
      bounceGroup.visible = layersRef.current.bounces;

      // progression du scroll : 0 quand la carte entre en bas de l'écran, 1 quand elle sort en haut
      const rect = card.getBoundingClientRect();
      const vh = window.innerHeight;
      const sp = clamp((vh - rect.top) / (vh + rect.height));
      // mouvement de la carte : inclinée → posée
      if (!reduced) {
        const e = clamp((vh - rect.top) / (vh * 0.7));
        card.style.transform = `perspective(1400px) rotateX(${(1 - e) * 18}deg) scale(${0.9 + e * 0.1})`;
        card.style.opacity = String(0.3 + e * 0.7);
      }

      const mode = viewRef.current;
      let c: { th: number; ph: number; r: number; follow: number };
      if (mode === 'cinematic') c = reduced ? { ...VIEWS.broadcast, follow: 0 } : camAt(clamp((sp - 0.15) / 0.7));
      else if (mode === 'free') c = { ...orbit, follow: 0 };
      else c = { ...VIEWS[mode], follow: 0 };
      const fitK = clamp(1.5 / camera.aspect, 1, 1.7);
      const r = c.r * fitK, sph = Math.sin(c.ph);
      fog.near = r + 8;
      fog.far = r + 60;
      const fx = ballOn ? ballNow.x * 0.6 : 0, fz = ballOn ? ballNow.z * 0.6 : 0;
      wantLook.set(fx * c.follow, 1 + (ballOn ? (ballNow.y - 1) * 0.3 : 0) * c.follow, fz * c.follow);
      wantPos.set(wantLook.x + r * sph * Math.sin(c.th), 1 + r * Math.cos(c.ph), wantLook.z + r * sph * Math.cos(c.th));
      const kk = first ? 1 : 1 - Math.pow(0.03, dt);
      first = false;
      camPos.lerp(wantPos, kk);
      camLook.lerp(wantLook, kk);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      if (composer) composer.render(dt);
      else renderer.render(scene, camera);

      // étiquettes projetées
      for (let i = 0; i < 4; i++) {
        const el = labelRefs.current[i];
        if (!el) continue;
        const rp = rigs[i].root.position;
        tmpv.set(rp.x, 2.05, rp.z).project(camera);
        el.style.transform = `translate(${(tmpv.x * 0.5 + 0.5) * SW - 12}px, ${(-tmpv.y * 0.5 + 0.5) * SH - 16}px)`;
        el.style.visibility = tmpv.z < 1 ? 'visible' : 'hidden';
      }
      const shot = shotRef.current;
      if (shot) {
        const on = shotPlayer >= 0 && now < shotUntil;
        if (on) {
          const rp = rigs[shotPlayer].root.position;
          tmpv.set(rp.x, 2.6, rp.z).project(camera);
          shot.style.transform = `translate(-50%, -100%) translate(${(tmpv.x * 0.5 + 0.5) * SW}px, ${(-tmpv.y * 0.5 + 0.5) * SH - 8}px)`;
        }
        shot.style.opacity = on ? String(clamp((shotUntil - now) / 0.4)) : '0';
      }
      if (pointRef.current) pointRef.current.style.opacity = now < pointUntil ? String(clamp((pointUntil - now) / 0.5)) : '0';
      raf = requestAnimationFrame(loop);
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) {
        clock.getDelta();
        raf = requestAnimationFrame(loop);
      }
    });
    io.observe(section);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      io.disconnect();
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((mat) => {
          Object.values(mat).forEach((v) => v instanceof THREE.Texture && v.dispose());
          mat.dispose();
        });
      });
      scene.environment?.dispose();
      glowTex.dispose();
      composer?.dispose();
      renderer.dispose();
    };
  }, [near]);

  return (
    <section id="replay" ref={sectionRef} className="mx-auto max-w-7xl px-6 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <span className="mb-6 inline-flex rounded-full border border-brand-blue/60 bg-brand-blue/20 px-3 py-1.5 text-xs font-medium text-white">
          ✨ 3D replay
        </span>
        <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
          Relive every rally <span className="font-serif font-normal italic">in 3D.</span>
        </h2>
        <p className="mt-6 text-gray-400">
          SmartPlay turns a match video into a 3D replay: players, ball, bounces, shots off the glass and the score, on a court you
          can watch from any angle.
        </p>
      </div>

      <div ref={cardRef} className="mt-14 origin-bottom will-change-transform">
        <div
          ref={stageRef}
          className="relative h-[460px] w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_0_80px_-20px_rgba(30,58,138,0.6)] md:h-[600px]"
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 block h-full w-full cursor-grab touch-pan-y active:cursor-grabbing"
            aria-label="Animated 3D padel court showing four players, the ball, bounces and the score"
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_70%_at_50%_50%,transparent_55%,rgba(0,0,0,0.6)_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/80 to-transparent" />

          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              ref={(el) => {
                labelRefs.current[i] = el;
              }}
              className={`pointer-events-none absolute left-0 top-0 z-[2] rounded px-1.5 text-[11px] font-semibold tracking-wide ${
                i < 2 ? 'bg-white text-black' : 'bg-brand-blue text-white'
              }`}
              style={{ visibility: 'hidden' }}
            >
              P{i + 1}
            </div>
          ))}

          {/* nom du coup + vitesse, au-dessus du frappeur */}
          <div ref={shotRef} className={shotClass(0)} style={{ opacity: 0 }} />

          {/* score */}
          <div className="pointer-events-none absolute left-3 top-3 z-[3]">
            <div className="rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-xs backdrop-blur-sm">
              {[0, 1].map((tm) => (
                <div key={tm} className="flex items-center gap-2 py-0.5">
                  <span className={`h-2 w-2 rounded-full ${tm ? 'bg-[#5b8cff]' : 'bg-white'}`} />
                  <span className="w-12 text-gray-300">{TEAM_NAME[tm]}</span>
                  <b
                    ref={(el) => {
                      scoreRefs.current[tm] = el;
                    }}
                    className="min-w-[2ch] text-right font-mono text-white tabular-nums"
                  >
                    0
                  </b>
                </div>
              ))}
            </div>
            <p ref={rallyRef} className="mt-2 text-[11px] text-gray-400 tabular-nums" />
          </div>

          <div
            ref={pointRef}
            className="pointer-events-none absolute left-1/2 top-16 z-[3] -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-black transition-opacity"
            style={{ opacity: 0 }}
          />

          <div className="absolute right-3 top-3 z-[3] flex overflow-hidden rounded-full border border-white/10 bg-black/60 backdrop-blur-sm">
            {VIEW_LABELS.map(([v, label]) => (
              <button
                key={v}
                onClick={() => pickView(v)}
                aria-pressed={view === v}
                className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors md:px-3 ${
                  view === v ? 'bg-white text-black' : 'text-gray-300 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-[3] flex flex-wrap justify-center gap-2 px-4">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-[11px] text-gray-300 backdrop-blur-sm tabular-nums">
                <b className={i < 2 ? 'text-white' : 'text-blue-300'}>P{i + 1}</b>{' '}
                <span
                  ref={(el) => {
                    chipRefs.current[i] = el;
                  }}
                >
                  –
                </span>
              </span>
            ))}
          </div>

          {error && <div className="absolute inset-0 z-[4] grid place-items-center p-6 text-center text-sm text-gray-400">{error}</div>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {LAYER_LABELS.map(([l, label]) => (
            <button
              key={l}
              onClick={() => toggleLayer(l)}
              aria-pressed={layers[l]}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                layers[l] ? 'border-brand-blue/70 bg-brand-blue/25 text-white' : 'border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              <span className={`h-2 w-2 rounded-sm ${layers[l] ? 'bg-[#5b8cff]' : 'border border-gray-500'}`} />
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">Drag to orbit · animated demo</p>
      </div>

      <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
        {FEATURES.map((f) => (
          <div key={f.title} className="bg-black p-5">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#5b8cff]" />
              <h3 className="text-sm font-medium text-white">{f.title}</h3>
              {f.soon && <span className="ml-auto rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-gray-500">Coming soon</span>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-gray-400">{f.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function shotClass(team: number) {
  return `pointer-events-none absolute left-0 top-0 z-[3] whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide shadow-lg ${
    team ? 'bg-brand-blue text-white' : 'bg-white text-black'
  }`;
}
