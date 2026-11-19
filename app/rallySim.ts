/*
 * Rallye de démonstration (marketing) pour la section 3D replay.
 * Entièrement chorégraphié : aucune donnée de match réelle.
 * Joueurs : 0 et 1 = équipe blanche (moitié z > 0), 2 et 3 = équipe bleue (moitié z < 0).
 * 0 et 2 jouent à gauche (x < 0), 1 et 3 à droite (x > 0).
 */

export type ShotType = 'Serve' | 'Drive' | 'Volley' | 'Lob' | 'Bandeja' | 'Víbora' | 'Smash';
export type HitEvent = { t: number; player: number; type: ShotType; kmh: number };
export type BounceEvent = { t: number; x: number; z: number };
export type WallEvent = { t: number; x: number; y: number; z: number };
export type PointEvent = { t: number; winner: 0 | 1; score: [string, string]; shots: number };
export type Sim = {
  fps: number;
  n: number;
  duration: number;
  px: Float32Array[];
  pz: Float32Array[];
  bx: Float32Array;
  by: Float32Array;
  bz: Float32Array;
  bon: Uint8Array;
  hits: HitEvent[];
  bounces: BounceEvent[];
  walls: WallEvent[];
  points: PointEvent[];
  pointStarts: number[];
};

type V3 = { x: number; y: number; z: number };
type Seg = { t0: number; t1: number; a: V3; b: V3; h: number };
type Key = { t: number; x: number; z: number };
type ScriptShot = { type: ShotType; x: number; z: number; wall?: boolean };
type ScriptPoint = { server: number; shots: ScriptShot[] };

// x, z = point de rebond (ou point d'interception si le coup suivant est joué de volée).
const SCRIPT: ScriptPoint[] = [
  {
    server: 1,
    shots: [
      { type: 'Serve', x: -2.3, z: -5.0 },
      { type: 'Drive', x: 1.2, z: 3.8 },
      { type: 'Volley', x: -2.0, z: -7.0 },
      { type: 'Lob', x: -1.0, z: 6.0 },
      { type: 'Bandeja', x: 2.0, z: -8.0, wall: true },
      { type: 'Drive', x: -1.0, z: 4.0 },
      { type: 'Volley', x: 2.5, z: -6.2 },
      { type: 'Lob', x: 1.2, z: 6.5 },
      { type: 'Smash', x: -1.5, z: -4.5 },
    ],
  },
  {
    server: 2,
    shots: [
      { type: 'Serve', x: 2.2, z: 5.0 },
      { type: 'Drive', x: -1.5, z: -3.8 },
      { type: 'Volley', x: -2.5, z: 7.8, wall: true },
      { type: 'Lob', x: -0.8, z: -6.2 },
      { type: 'Víbora', x: 2.8, z: 7.2, wall: true },
      { type: 'Drive', x: 0.5, z: -3.6 },
      { type: 'Volley', x: -3.2, z: 5.5 },
    ],
  },
  {
    server: 0,
    shots: [
      { type: 'Serve', x: 2.2, z: -5.0 },
      { type: 'Drive', x: -2.2, z: 6.8 },
      { type: 'Lob', x: -1.5, z: -8.7, wall: true },
      { type: 'Drive', x: 1.0, z: 3.6 },
      { type: 'Volley', x: 0.2, z: -6.0 },
      { type: 'Lob', x: 0.5, z: 6.2 },
      { type: 'Smash', x: 2.0, z: -3.0 },
    ],
  },
];

const AIR = new Set<ShotType>(['Volley', 'Bandeja', 'Víbora', 'Smash']);
export const OVERHEAD = new Set<ShotType>(['Bandeja', 'Víbora', 'Smash']);
const SPEED: Record<ShotType, number> = { Serve: 17, Drive: 19, Volley: 15, Lob: 11, Bandeja: 16, Víbora: 21, Smash: 27 }; // m/s
const ARC: Record<ShotType, number> = { Serve: 0.9, Drive: 0.9, Volley: 0.5, Lob: 4.2, Bandeja: 0.9, Víbora: 0.5, Smash: 0.15 };
const SCORE_NAMES = ['0', '15', '30', '40', 'Game'];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
export const teamOf = (p: number) => (p < 2 ? 0 : 1);
const partnerOf = (p: number) => p ^ 1;
const sidePlayer = (team: number, x: number) => team * 2 + (x < 0 ? 0 : 1);
const fwdOf = (team: number) => (team === 0 ? -1 : 1); // sens du regard en z
const rightOf = (team: number) => (team === 0 ? 1 : -1); // côté raquette en x

const arcY = (a: V3, b: V3, h: number, u: number) => a.y + (b.y - a.y) * u + 4 * h * u * (1 - u);

// Relève la trajectoire si elle ne passe pas au-dessus du filet.
function clearNet(a: V3, b: V3, h: number) {
  if (Math.sign(a.z) === Math.sign(b.z)) return h;
  const u = a.z / (a.z - b.z);
  const y = arcY(a, b, h, u);
  return y < 1.15 ? h + (1.15 - y) / (4 * u * (1 - u)) : h;
}

// Position du corps du joueur pour une frappe au point c.
function bodyFor(c: V3, p: number, over: boolean) {
  const team = teamOf(p);
  const x = clamp(c.x - (over ? 0.2 : 0.5) * rightOf(team), -4.6, 4.6);
  const z = c.z - fwdOf(team) * (over ? 0.35 : 0.2);
  return { x, z: team === 0 ? clamp(z, 0.8, 9.7) : clamp(z, -9.7, -0.8) };
}

export function buildSim(fps = 60): Sim {
  const segs: Seg[] = [];
  const keys: Key[][] = [[], [], [], []];
  const hits: HitEvent[] = [], bounces: BounceEvent[] = [], walls: WallEvent[] = [], points: PointEvent[] = [], pointStarts: number[] = [];
  const score = [0, 0];
  const add = (p: number, t: number, x: number, z: number) => keys[p].push({ t, x, z });
  const partnerSpot = (bx: number, bz: number, team: number) => ({
    x: bx < 0 ? 2.3 : -2.3,
    z: team === 0 ? clamp(bz, 3.4, 8.8) : clamp(bz, -8.8, -3.4),
  });

  let t = 2.0;
  for (const P of SCRIPT) {
    const st = teamOf(P.server);
    const serveX = P.server % 2 === 0 ? -1.6 : 1.6;
    const sz = st === 0 ? 9.5 : -9.5;
    const recv = sidePlayer(1 - st, -serveX);
    pointStarts.push(t);
    (
      [
        [P.server, serveX, sz],
        [partnerOf(P.server), -Math.sign(serveX) * 2.4, st === 0 ? 3.6 : -3.6],
        [recv, -Math.sign(serveX) * 2.5, st === 0 ? -8.6 : 8.6],
        [partnerOf(recv), Math.sign(serveX) * 2.3, st === 0 ? -6.8 : 6.8],
      ] as [number, number, number][]
    ).forEach(([p, x, z]) => {
      add(p, t - 1.4, x, z);
      add(p, t, x, z);
    });

    let hitter = P.server;
    let C: V3 = { x: serveX + 0.45 * rightOf(st), y: 1.0, z: sz + fwdOf(st) * 0.2 };

    for (let k = 0; k < P.shots.length; k++) {
      const s = P.shots[k], next = P.shots[k + 1];
      const team = teamOf(hitter);
      const sp = SPEED[s.type];
      let tt = t;
      const pushSeg = (a: V3, b: V3, h: number, speed: number) => {
        const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const dur = Math.max(0.12, d / speed);
        segs.push({ t0: tt, t1: tt + dur, a, b, h });
        tt += dur;
      };
      hits.push({ t, player: hitter, type: s.type, kmh: Math.round(sp * 3.6) });

      // corps du frappeur + partenaire au moment de la frappe
      const hb = bodyFor(C, hitter, OVERHEAD.has(s.type));
      add(hitter, t, hb.x, hb.z);
      if (k > 0) {
        const ps = partnerSpot(hb.x, hb.z, team);
        add(partnerOf(hitter), t, ps.x, ps.z);
      }

      let R: V3 | null = null;
      const L: V3 = { x: s.x, y: 0.03, z: s.z };
      if (next && AIR.has(next.type)) {
        R = { x: s.x, y: OVERHEAD.has(next.type) ? 2.6 : 1.1, z: s.z };
        pushSeg(C, R, clearNet(C, R, ARC[s.type]), sp);
      } else {
        pushSeg(C, L, clearNet(C, L, ARC[s.type]), sp);
        bounces.push({ t: tt, x: L.x, z: L.z });
        const dx = L.x - C.x, dz = L.z - C.z, dl = Math.hypot(dx, dz) || 1;
        const ux = dx / dl, uz = dz / dl;
        if (s.wall) {
          const W: V3 = { x: clamp(L.x + ux * ((9.95 - Math.abs(L.z)) / Math.max(0.2, Math.abs(uz))), -4.6, 4.6), y: 1.4, z: Math.sign(L.z) * 9.95 };
          pushSeg(L, W, 0.5, sp * 0.6);
          walls.push({ t: tt, ...W });
          R = { x: W.x * 0.85, y: 1.0, z: Math.sign(L.z) * 8.3 };
          pushSeg(W, R, 0.35, sp * 0.45);
        } else if (!next) {
          const L2: V3 = { x: clamp(L.x + ux * 3, -4.8, 4.8), y: 0.03, z: clamp(L.z + uz * 3, -9.8, 9.8) };
          pushSeg(L, L2, 0.55, sp * 0.7);
          bounces.push({ t: tt, x: L2.x, z: L2.z });
          pushSeg(L2, { x: L2.x + ux, y: 0.03, z: clamp(L2.z + uz, -9.9, 9.9) }, 0.2, sp * 0.5);
        } else {
          R = { x: clamp(L.x + ux * 1.7, -4.4, 4.4), y: 1.0, z: clamp(L.z + uz * 1.7, -9.0, 9.0) };
          pushSeg(L, R, 0.7, sp * 0.7);
        }
      }

      if (R && next) {
        const rcv = sidePlayer(1 - team, R.x);
        const rb = bodyFor(R, rcv, OVERHEAD.has(next.type));
        add(rcv, tt, rb.x, rb.z);
        const ps = partnerSpot(rb.x, rb.z, 1 - team);
        add(partnerOf(rcv), tt, ps.x, ps.z);
        hitter = rcv;
        C = R;
        t = tt;
      } else {
        score[team]++;
        points.push({ t: tt, winner: team as 0 | 1, score: [SCORE_NAMES[score[0]], SCORE_NAMES[score[1]]], shots: P.shots.length });
        t = tt + 3.2;
      }
    }
  }
  const duration = t;
  // boucle sans coupure : chaque joueur revient à sa première position
  keys.forEach((k) => {
    k.sort((a, b) => a.t - b.t);
    k.push({ t: duration + 0.6, x: k[0].x, z: k[0].z });
  });

  const n = Math.ceil(duration * fps);
  const px = keys.map(() => new Float32Array(n)), pz = keys.map(() => new Float32Array(n));
  keys.forEach((k, p) => {
    let i = 0;
    for (let f = 0; f < n; f++) {
      const tf = f / fps;
      while (i < k.length - 2 && tf > k[i + 1].t) i++;
      const a = k[i], b = k[i + 1];
      const u = tf <= a.t ? 0 : tf >= b.t ? 1 : smooth((tf - a.t) / Math.max(1e-3, b.t - a.t));
      px[p][f] = a.x + (b.x - a.x) * u;
      pz[p][f] = a.z + (b.z - a.z) * u;
    }
  });

  const bx = new Float32Array(n), by = new Float32Array(n), bz = new Float32Array(n), bon = new Uint8Array(n);
  segs.forEach((s) => {
    for (let f = Math.ceil(s.t0 * fps); f < Math.min(n, s.t1 * fps); f++) {
      const u = (f / fps - s.t0) / (s.t1 - s.t0);
      bx[f] = s.a.x + (s.b.x - s.a.x) * u;
      by[f] = arcY(s.a, s.b, s.h, u);
      bz[f] = s.a.z + (s.b.z - s.a.z) * u;
      bon[f] = 1;
    }
  });

  return { fps, n, duration, px, pz, bx, by, bz, bon, hits, bounces, walls, points, pointStarts };
}
