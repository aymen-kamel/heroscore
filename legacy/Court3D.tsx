'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { Edges, Float, Line } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

// Padel court: 20 m x 10 m. Scene units = metres.
const L = 20;
const W = 10;
const BLUE = '#4C7DE0';
const GREEN = '#3DDC97';
const GOLD = '#F5B94A';

function CourtFloor() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, L]} />
        <meshStandardMaterial color="#0E1840" roughness={0.9} />
      </mesh>
      {/* Court lines */}
      {[
        [[-W / 2, 0.01, 0], [W / 2, 0.01, 0]],
        [[-W / 2, 0.01, -6.95], [W / 2, 0.01, -6.95]],
        [[-W / 2, 0.01, 6.95], [W / 2, 0.01, 6.95]],
        [[0, 0.01, -6.95], [0, 0.01, 6.95]],
      ].map((pts, i) => (
        <Line key={i} points={pts as [number, number, number][]} color="#E8ECF6" lineWidth={1.5} transparent opacity={0.55} />
      ))}
      {/* Net */}
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[W, 0.88, 0.04]} />
        <meshStandardMaterial color="#E8ECF6" transparent opacity={0.18} />
        <Edges color="#E8ECF6" />
      </mesh>
    </group>
  );
}

function GlassWalls() {
  const mat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: BLUE, transparent: true, opacity: 0.07, roughness: 0, metalness: 0.1 }),
    []
  );
  const walls: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [0, 1.5, -L / 2], size: [W, 3, 0.05] },
    { pos: [0, 1.5, L / 2], size: [W, 3, 0.05] },
    { pos: [-W / 2, 1.5, -L / 2 + 2], size: [0.05, 3, 4] },
    { pos: [W / 2, 1.5, -L / 2 + 2], size: [0.05, 3, 4] },
    { pos: [-W / 2, 1.5, L / 2 - 2], size: [0.05, 3, 4] },
    { pos: [W / 2, 1.5, L / 2 - 2], size: [0.05, 3, 4] },
  ];
  return (
    <group>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos} material={mat}>
          <boxGeometry args={w.size} />
          <Edges color={BLUE} />
        </mesh>
      ))}
    </group>
  );
}

function Player({ base, color, phase }: { base: [number, number]; color: string; phase: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * 0.8 + phase;
    if (ref.current) {
      ref.current.position.x = base[0] + Math.sin(t) * 1.3;
      ref.current.position.z = base[1] + Math.cos(t * 0.7) * 0.9;
    }
  });
  return (
    <group ref={ref} position={[base[0], 0, base[1]]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.28, 1.1, 6, 12]} />
        <meshStandardMaterial color="#C9D3F0" roughness={0.6} />
      </mesh>
      {/* AI detection box */}
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[0.9, 2, 0.9]} />
        <meshBasicMaterial transparent opacity={0} />
        <Edges color={color} />
      </mesh>
      {/* Heat spot */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <circleGeometry args={[1.4, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} />
      </mesh>
    </group>
  );
}

function Ball() {
  const ref = useRef<THREE.Mesh>(null);
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(2, 1.2, 6),
          new THREE.Vector3(0.5, 3.4, 1.5),
          new THREE.Vector3(-1.5, 1.6, -4),
          new THREE.Vector3(-2.5, 0.1, -6.5),
          new THREE.Vector3(-1, 2.2, -8.5),
          new THREE.Vector3(1.5, 3.2, -3),
          new THREE.Vector3(2.5, 1.4, 3),
        ],
        true
      ),
    []
  );
  const pts = useMemo(() => curve.getPoints(160).map((p) => [p.x, p.y, p.z] as [number, number, number]), [curve]);
  useFrame(({ clock }) => {
    const t = (clock.getElapsedTime() * 0.08) % 1;
    if (ref.current) ref.current.position.copy(curve.getPointAt(t));
  });
  return (
    <group>
      <Line points={pts} color={GOLD} lineWidth={1.5} dashed dashSize={0.25} gapSize={0.35} transparent opacity={0.8} />
      <mesh ref={ref}>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

function Rig() {
  useFrame(({ camera, clock, pointer }) => {
    const t = clock.getElapsedTime() * 0.06;
    const r = 21;
    camera.position.x = Math.sin(t) * r + pointer.x * 1.5;
    camera.position.z = Math.cos(t) * r;
    camera.position.y = 11 + pointer.y * 1.2;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function Court3D() {
  return (
    <Canvas camera={{ position: [0, 11, 21], fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <fog attach="fog" args={['#050816', 22, 45]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 14, 8]} intensity={1.2} color="#9FBCFF" />
      <pointLight position={[0, 6, 0]} intensity={30} color={BLUE} />
      <Rig />
      <Float speed={0.6} rotationIntensity={0} floatIntensity={0.15}>
        <group>
          <CourtFloor />
          <GlassWalls />
          <Player base={[-2.5, 6]} color={BLUE} phase={0} />
          <Player base={[2.5, 5]} color={BLUE} phase={1.7} />
          <Player base={[-2.2, -5.5]} color={GREEN} phase={3.1} />
          <Player base={[2.4, -6]} color={GREEN} phase={4.4} />
          <Ball />
        </group>
      </Float>
    </Canvas>
  );
}
