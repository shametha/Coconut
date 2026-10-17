"use client";

import * as THREE from "three";
import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Lightformer,
  Line,
  MeshTransmissionMaterial,
  OrbitControls,
  Text,
  useTexture,
} from "@react-three/drei";
import { ParametricGeometry } from "three/examples/jsm/geometries/ParametricGeometry.js";

/**
 * Coconut — reference-locked 3D assembly
 *
 * explode = 0  -> closed graphite shell
 * explode = 1  -> five-part exploded view
 *
 * Required asset:
 *   /public/artwork/graphite-ridged.png
 *
 * Recommended packages:
 *   npm i three @react-three/fiber @react-three/drei
 */

const TUNING = {
  shellOpenX: 2.0,
  ivoryOpenX: 1.0,
  shellOpenYaw: 0.22,
  ivoryOpenYaw: 0.12,
  wholeRotation: new THREE.Euler(0.045, -0.15, -0.095),
  camera: {
    closed: new THREE.Vector3(1.4, 1.7, 8.0),
    open: new THREE.Vector3(2.2, 1.9, 10.2),
    target: new THREE.Vector3(0, -0.03, 0),
    fov: 32,
  },
};

export type ArtifactTuning = {
  fov: number;
  camClosed: [number, number, number];
  camOpen: [number, number, number];
  rotX: number;
  rotY: number;
  rotZ: number;
  shellA: number;
  shellB: number;
  shellC: number;
  shellAsym: number;
  shellOpenX: number;
  shellOpenYaw: number;
  ivoryOpenX: number;
  ivoryOpenYaw: number;
  seamTiltY: number;
  seamTiltZ: number;
  seamOffset: number;
  graphiteRough: number;
  graphiteBump: number;
  keyPos: [number, number, number];
  keyIntensity: number;
  keyAngle: number;
};

export const DEFAULT_TUNING: ArtifactTuning = {
  fov: 32,
  camClosed: [1.4, 1.7, 8.0],
  camOpen: [2.2, 1.9, 10.2],
  rotX: 0.045,
  rotY: -0.15,
  rotZ: -0.095,
  shellA: 2.05,
  shellB: 1.28,
  shellC: 1.02,
  shellAsym: 0.1,
  shellOpenX: 2.0,
  shellOpenYaw: 0.22,
  ivoryOpenX: 1.0,
  ivoryOpenYaw: 0.12,
  seamTiltY: 3.6,
  seamTiltZ: 2.0,
  seamOffset: 0.12,
  graphiteRough: 0.88,
  graphiteBump: 0.012,
  keyPos: [-5.4, 7.1, 5.4],
  keyIntensity: 95,
  keyAngle: 0.68,
};

const TuningCtx = React.createContext<ArtifactTuning>(DEFAULT_TUNING);

/** The cut and all three inner surfaces share one physical plane.
 * In the closed body it follows the long seam; opening turns that plane
 * upright while the same five pieces separate along its normal. */
function useSeamFrame() {
  const t = React.useContext(TuningCtx);
  return useMemo(() => {
    const normal = new THREE.Vector3(1, -t.seamTiltY, -t.seamTiltZ).normalize();
    const longAxis = new THREE.Vector3(1, 0, 0)
      .addScaledVector(normal, -normal.x)
      .normalize();
    const depthAxis = new THREE.Vector3()
      .crossVectors(normal, longAxis)
      .normalize();
    const toBody = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(normal, longAxis, depthAxis),
    );
    return { normal, longAxis, toBody, toOpen: toBody.clone().invert() };
  }, [t.seamTiltY, t.seamTiltZ]);
}

export type ShellParams = { a: number; b: number; c: number; asym: number };
export type SeamParams = { tiltY: number; tiltZ: number; offset: number };

/** Closed-form sculpted shell: wide, low, asymmetric oblate body. */
function shellPoint(u01: number, v01: number, p: ShellParams): THREE.Vector3 {
  const theta = (u01 - 0.5) * Math.PI;
  const phi = v01 * Math.PI * 2;
  const sinT = Math.sin(theta);
  const cosT = Math.cos(theta);
  let x = p.a * sinT;
  x *= 1 + p.asym * sinT;
  const r = cosT;
  let y = p.b * r * Math.sin(phi);
  let z = p.c * r * Math.cos(phi);
  y *= 1 + 0.05 * Math.sin(3 * phi + 2 * theta);
  z *= 1 + 0.04 * Math.sin(2 * phi - theta);
  if (y < 0) y *= 0.94;
  return new THREE.Vector3(x, y, z);
}

function splitValue(v: THREE.Vector3, s: SeamParams) {
  return v.x - s.tiltY * v.y - s.tiltZ * v.z + s.offset;
}

const SHELL_NU = 170;
const SHELL_NV = 120;

/** Split the sculpted shell along the oblique seam. Returns per-half
 *  indexed geometries plus the shared boundary loop for the seam lips. */
function buildShell(p: ShellParams, s: SeamParams) {
  const cols = SHELL_NV + 1;
  const pos: number[] = [];
  const uv: number[] = [];
  const sval: number[] = [];
  const node = (i: number, j: number) => i * cols + j;
  for (let i = 0; i <= SHELL_NU; i++) {
    for (let j = 0; j <= SHELL_NV; j++) {
      const v = shellPoint(i / SHELL_NU, j / SHELL_NV, p);
      pos.push(v.x, v.y, v.z);
      uv.push(i / SHELL_NU, j / SHELL_NV);
      sval.push(splitValue(v, s));
    }
  }
  type Vertex = {
    x: number;
    y: number;
    z: number;
    u: number;
    v: number;
    split: number;
  };
  type Side = {
    map: Map<string, number>;
    positions: number[];
    uvs: number[];
    index: number[];
  };
  const makeSide = (): Side => ({
    map: new Map(),
    positions: [],
    uvs: [],
    index: [],
  });
  const left = makeSide();
  const right = makeSide();
  const vertex = (n: number): Vertex => ({
    x: pos[n * 3],
    y: pos[n * 3 + 1],
    z: pos[n * 3 + 2],
    u: uv[n * 2],
    v: uv[n * 2 + 1],
    split: sval[n],
  });
  const intersect = (a: Vertex, b: Vertex): Vertex => {
    const t = a.split / (a.split - b.split);
    return {
      x: THREE.MathUtils.lerp(a.x, b.x, t),
      y: THREE.MathUtils.lerp(a.y, b.y, t),
      z: THREE.MathUtils.lerp(a.z, b.z, t),
      u: THREE.MathUtils.lerp(a.u, b.u, t),
      v: THREE.MathUtils.lerp(a.v, b.v, t),
      split: 0,
    };
  };
  function clip(poly: Vertex[], positive: boolean) {
    const out: Vertex[] = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const aInside = positive ? a.split >= 0 : a.split <= 0;
      const bInside = positive ? b.split >= 0 : b.split <= 0;
      if (aInside) out.push(a);
      if (aInside !== bInside) out.push(intersect(a, b));
    }
    return out;
  }
  function put(side: Side, v: Vertex) {
    // Shared vertices keep lighting continuous all the way to the cut edge.
    const key = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)},${v.u.toFixed(5)},${v.v.toFixed(5)}`;
    let k = side.map.get(key);
    if (k === undefined) {
      k = side.positions.length / 3;
      side.map.set(key, k);
      side.positions.push(v.x, v.y, v.z);
      side.uvs.push(v.u, v.v);
    }
    return k;
  }
  function emit(side: Side, poly: Vertex[]) {
    if (poly.length < 3) return;
    const ids = poly.map((v) => put(side, v));
    for (let i = 1; i < ids.length - 1; i++) {
      if (ids[0] !== ids[i] && ids[i] !== ids[i + 1] && ids[i + 1] !== ids[0])
        side.index.push(ids[0], ids[i], ids[i + 1]);
    }
  }
  for (let i = 0; i < SHELL_NU; i++) {
    for (let j = 0; j < SHELL_NV; j++) {
      const a = vertex(node(i, j));
      const b = vertex(node(i + 1, j));
      const c = vertex(node(i + 1, j + 1));
      const d = vertex(node(i, j + 1));
      for (const triangle of [
        [a, b, c],
        [a, c, d],
      ]) {
        emit(left, clip(triangle, false));
        emit(right, clip(triangle, true));
      }
    }
  }
  function toGeometry(side: Side) {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(side.positions, 3),
    );
    g.setAttribute("uv", new THREE.Float32BufferAttribute(side.uvs, 2));
    g.setIndex(side.index);
    g.computeVertexNormals();
    return g;
  }
  // Analytic seam loop: bisect the oblique plane per v-row. Exact, smooth,
  // independent of grid tessellation.
  const loop: THREE.Vector3[] = [];
  for (let j = 0; j < SHELL_NV; j++) {
    const v01 = j / SHELL_NV;
    const f = (u: number) => splitValue(shellPoint(u, v01, p), s);
    let lo = 0;
    let hi = 1;
    if (f(lo) * f(hi) > 0) continue;
    for (let k = 0; k < 26; k++) {
      const mid = (lo + hi) / 2;
      if (f(lo) * f(mid) <= 0) hi = mid;
      else lo = mid;
    }
    loop.push(shellPoint((lo + hi) / 2, v01, p));
  }
  return { left: toGeometry(left), right: toGeometry(right), loop };
}

function damp(current: number, target: number, speed: number, dt: number) {
  return THREE.MathUtils.damp(current, target, speed, dt);
}

class Ellipse3DCurve extends THREE.Curve<THREE.Vector3> {
  ry: number;
  rz: number;
  x: number;
  pinch: number;
  constructor(ry: number, rz: number, x = 0, pinch = 0) {
    super();
    this.ry = ry;
    this.rz = rz;
    this.x = x;
    this.pinch = pinch;
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    const f = 1 - this.pinch * Math.cos(2 * a);
    return target.set(
      this.x,
      Math.cos(a) * this.ry * f,
      Math.sin(a) * this.rz * f,
    );
  }
}

function useGraphiteMaps() {
  const src = useTexture("/artwork/graphite-ridged.png");
  const { gl } = useThree();

  const colorMap = useMemo(() => src.clone(), [src]);
  const bumpMap = useMemo(() => src.clone(), [src]);

  useEffect(() => {
    const maxAniso = Math.min(12, gl.capabilities.getMaxAnisotropy());
    for (const tex of [colorMap, bumpMap]) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(3.2, 3.2);
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
    }
    colorMap.colorSpace = THREE.SRGBColorSpace;
    bumpMap.colorSpace = THREE.NoColorSpace;
  }, [colorMap, bumpMap, gl]);

  return { colorMap, bumpMap };
}

function useMembraneGrain() {
  return useMemo(() => {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    let seed = 2718;
    for (let i = 0; i < size * size; i++) {
      seed = (seed * 16807) % 2147483647;
      const noise = seed / 2147483647;
      const value = noise < 0.05 ? 125 + noise * 1300 : 223 + noise * 32;
      data[i * 4] = value;
      data[i * 4 + 1] = value;
      data[i * 4 + 2] = value;
      data[i * 4 + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.3, 2);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
}

/** Seam lips grown from the actual split boundary: smoked bronze plus a
 *  hairline ivory secondary edge riding just outside it. */
function SeamLips({
  loop,
  side,
  highlighted,
  dimmed,
}: {
  loop: THREE.Vector3[];
  side: "left" | "right";
  highlighted?: boolean;
  dimmed?: boolean;
}) {
  const frame = useSeamFrame();
  const bronze = useMemo(() => {
    if (!loop.length) return null;
    const center = loop
      .reduce((sum, p) => sum.add(p), new THREE.Vector3())
      .divideScalar(loop.length);
    const positions: number[] = [];
    const indices: number[] = [];
    const sign = side === "left" ? -1 : 1;
    loop.forEach((point, index) => {
      const radial = point.clone().sub(center).normalize();
      const width =
        0.025 +
        0.055 * Math.pow(THREE.MathUtils.clamp((point.x + 2.1) / 4.2, 0, 1), 2);
      const edge = point.clone().addScaledVector(radial, 0.008);
      const inner = edge.clone().addScaledVector(frame.normal, sign * width);
      positions.push(...edge.toArray(), ...inner.toArray());
      const next = (index + 1) % loop.length;
      indices.push(
        index * 2,
        next * 2,
        index * 2 + 1,
        next * 2,
        next * 2 + 1,
        index * 2 + 1,
      );
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [loop, side, frame]);
  const hairline = useMemo(() => {
    if (!loop.length) return null;
    const centroid = loop
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .multiplyScalar(1 / loop.length);
    const pts = loop.map((p) => {
      const dir = p.clone().sub(centroid).normalize();
      return p.clone().addScaledVector(dir, 0.009);
    });
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts, true),
      300,
      0.005,
      8,
      true,
    );
  }, [loop]);
  if (!bronze || !hairline) return null;
  return (
    <>
      <mesh geometry={bronze} castShadow>
        <meshPhysicalMaterial
          color={dimmed ? "#514b43" : highlighted ? "#b6a180" : "#918578"}
          metalness={0.92}
          roughness={0.2}
          clearcoat={0.45}
          clearcoatRoughness={0.18}
          envMapIntensity={dimmed ? 0.45 : 1.35}
          side={THREE.DoubleSide}
          emissive={highlighted ? "#a35a16" : "#000000"}
          emissiveIntensity={highlighted ? 0.75 : 0}
        />
      </mesh>
      <mesh geometry={hairline}>
        <meshPhysicalMaterial
          color={dimmed ? "#655d50" : highlighted ? "#f0cb91" : "#d7c7ad"}
          metalness={0.42}
          roughness={0.28}
          clearcoat={0.32}
          envMapIntensity={dimmed ? 0.3 : 1.05}
          emissive={highlighted ? "#9a5e22" : "#000000"}
          emissiveIntensity={highlighted ? 0.35 : 0}
        />
      </mesh>
    </>
  );
}

function ShellHalf({
  side,
  explode,
  highlighted,
  dimmed,
  onHover,
}: {
  side: "left" | "right";
  explode: number;
  highlighted?: boolean;
  dimmed?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  const t = React.useContext(TuningCtx);
  const shell = useMemo(
    () =>
      buildShell(
        { a: t.shellA, b: t.shellB, c: t.shellC, asym: t.shellAsym },
        { tiltY: t.seamTiltY, tiltZ: t.seamTiltZ, offset: t.seamOffset },
      ),
    [
      t.shellA,
      t.shellB,
      t.shellC,
      t.shellAsym,
      t.seamTiltY,
      t.seamTiltZ,
      t.seamOffset,
    ],
  );
  const geometry = side === "left" ? shell.left : shell.right;
  const { colorMap, bumpMap } = useGraphiteMaps();
  const group = useRef<THREE.Group>(null!);
  const current = useRef(0);
  const sign = side === "left" ? -1 : 1;
  const frame = useSeamFrame();

  useFrame((_, dt) => {
    current.current = damp(current.current, explode, 5.4, dt);
    const k = THREE.MathUtils.smootherstep(current.current, 0, 1);

    group.current.position
      .copy(frame.normal)
      .multiplyScalar(sign * t.shellOpenX * k);
    group.current.quaternion.setFromAxisAngle(
      frame.longAxis,
      -sign * t.shellOpenYaw * k,
    );
  });

  return (
    <group
      ref={group}
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover?.(true);
      }}
      onPointerOut={() => onHover?.(false)}
    >
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          map={colorMap}
          bumpMap={bumpMap}
          bumpScale={t.graphiteBump}
          roughness={t.graphiteRough}
          metalness={0.16}
          color={dimmed ? "#666664" : "#b7b7b4"}
          envMapIntensity={dimmed ? 0.35 : 0.8}
          emissive={highlighted ? "#4b2b10" : "#000000"}
          emissiveIntensity={highlighted ? 0.2 : 0}
          side={THREE.FrontSide}
          onBeforeCompile={(shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <map_fragment>",
              "#include <map_fragment>\nfloat graphiteLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\ndiffuseColor.rgb = mix(vec3(graphiteLuma), diffuseColor.rgb, 0.12);",
            );
          }}
          customProgramCacheKey={() => "graphite-neutral-v1"}
        />
      </mesh>

      {/* Dark concave inside of each shell half. */}
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={dimmed ? "#070707" : "#0c0c0b"}
          roughness={0.48}
          metalness={0.1}
          clearcoat={0.08}
          envMapIntensity={0.38}
          side={THREE.BackSide}
        />
      </mesh>

      <SeamLips
        loop={shell.loop}
        side={side}
        highlighted={highlighted}
        dimmed={dimmed}
      />
    </group>
  );
}

export type MembraneParams = {
  ry: number;
  rz: number;
  bulge: number;
  skew: number;
  pinch: number;
  sweep?: number;
  tilt?: number;
  twist?: number;
  tipTaper?: number;
};

/** One shared surface math for geometry, etch lines, nodes and microtype,
 *  so markings always sit exactly on the membrane. */
function membranePoint(
  p: MembraneParams,
  yn: number,
  zn: number,
): [number, number, number] {
  const r = Math.min(1, Math.sqrt(yn * yn + zn * zn));
  const a = Math.atan2(zn, yn);
  const f = 1 - p.pinch * r * Math.cos(2 * a);
  const y = p.ry * yn * f;
  const z = p.rz * zn * f * (1 - (p.tipTaper ?? 0) * yn * yn);
  const radial = Math.min(1, r * r);
  // A swept perimeter is essential here: a planar elliptical rim produces
  // a flat plate even when the middle is bowed. These edges curl through
  // depth and lean differently at the two tips, like the reference petals.
  const edgeSweep =
    (p.sweep ?? 0) * (1 - yn * yn) +
    (p.tilt ?? 0) * yn +
    (p.twist ?? 0) * yn * z;
  const x = edgeSweep + p.bulge * (1 - radial) + p.skew * z * (1 - radial);
  return [x, y, z];
}

function makeMembraneGeometry(p: MembraneParams) {
  const g = new ParametricGeometry(
    (u, v, out) => {
      // sqrt distributes vertices more evenly over the elliptical disk.
      const r = Math.sqrt(u);
      const a = v * Math.PI * 2;
      const [x, y, z] = membranePoint(p, r * Math.cos(a), r * Math.sin(a));
      out.set(x, y, z);
    },
    72,
    128,
  );
  // Calculate normals in surface coordinates. Polar center vertices share
  // one normal, preventing the triangular shading wedges of a disk fan.
  const uv = g.getAttribute("uv");
  const normals = g.getAttribute("normal");
  const delta = 0.0001;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < uv.count; i++) {
    const radius = Math.sqrt(uv.getX(i));
    const angle = uv.getY(i) * Math.PI * 2;
    const y = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    a.fromArray(membranePoint(p, y + delta, z)).sub(
      new THREE.Vector3(...membranePoint(p, y - delta, z)),
    );
    b.fromArray(membranePoint(p, y, z + delta)).sub(
      new THREE.Vector3(...membranePoint(p, y, z - delta)),
    );
    a.cross(b).normalize();
    normals.setXYZ(i, a.x, a.y, a.z);
  }
  return g;
}

function MembraneRim({
  params,
  color = "#d8ccb9",
}: {
  params: MembraneParams;
  color?: string;
}) {
  const geo = useMemo(() => {
    const points = Array.from({ length: 192 }, (_, i) => {
      const angle = (i / 192) * Math.PI * 2;
      return new THREE.Vector3(
        ...membranePoint(params, Math.cos(angle), Math.sin(angle)),
      );
    });
    return new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points, true),
      192,
      0.012,
      8,
      true,
    );
  }, [
    params.ry,
    params.rz,
    params.bulge,
    params.skew,
    params.pinch,
    params.sweep,
    params.tilt,
    params.twist,
    params.tipTaper,
  ]);
  return (
    <mesh geometry={geo}>
      <meshPhysicalMaterial
        color={color}
        metalness={0.18}
        roughness={0.34}
        clearcoat={0.2}
        envMapIntensity={0.86}
      />
    </mesh>
  );
}

const etchA: [number, number][] = [
  [-0.58, 0.22],
  [-0.4, -0.1],
  [-0.18, 0.31],
  [0.04, -0.18],
  [0.27, 0.18],
  [0.48, -0.28],
];
const etchB: [number, number][] = [
  [-0.5, -0.32],
  [-0.22, -0.12],
  [0.02, 0.12],
  [0.31, 0.3],
  [0.52, 0.02],
];

function surfacePoint(p: MembraneParams, yz: [number, number], xLift = 0.014) {
  const [x, y, z] = membranePoint(p, yz[0], yz[1]);
  return [x + xLift, y, z] as [number, number, number];
}

function EtchedRelationships({
  params,
  flip = false,
  glass = false,
}: {
  params: MembraneParams;
  flip?: boolean;
  glass?: boolean;
}) {
  const lift = flip ? -0.018 : 0.018;
  const a = etchA.map((p) => surfacePoint(params, p, lift));
  const b = etchB.map((p) => surfacePoint(params, p, lift));
  const detail = useMemo(() => {
    let seed = 1847;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const nodes: [number, number][] = [];
    while (nodes.length < (glass ? 85 : 65)) {
      const y = random() * 1.78 - 0.89;
      const z = random() * 1.78 - 0.89;
      if (y * y + z * z < 0.83) nodes.push([y, z]);
    }
    const segments: number[] = [];
    nodes.forEach((point, i) => {
      const neighbours = nodes
        .map((other, j) => ({
          j,
          distance: Math.hypot(point[0] - other[0], point[1] - other[1]),
        }))
        .filter(
          ({ j, distance }) => j > i && distance > 0.12 && distance < 0.38,
        )
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 2);
      for (const { j } of neighbours) {
        for (let step = 0; step < 8; step++) {
          for (const t of [step / 8, (step + 1) / 8]) {
            segments.push(
              ...surfacePoint(
                params,
                [
                  THREE.MathUtils.lerp(point[0], nodes[j][0], t),
                  THREE.MathUtils.lerp(point[1], nodes[j][1], t),
                ],
                lift,
              ),
            );
          }
        }
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(segments, 3),
    );
    return { nodes, geometry };
  }, [
    params.ry,
    params.rz,
    params.bulge,
    params.skew,
    params.pinch,
    params.sweep,
    params.tilt,
    params.twist,
    params.tipTaper,
    lift,
    glass,
  ]);
  return (
    <group>
      <lineSegments geometry={detail.geometry}>
        <lineBasicMaterial
          color={glass ? "#b38d55" : "#81715e"}
          transparent
          opacity={glass ? 0.2 : 0.28}
        />
      </lineSegments>
      {detail.nodes.map((point, i) => (
        <mesh key={`grain-${i}`} position={surfacePoint(params, point, lift)}>
          <sphereGeometry args={[i % 9 === 0 ? 0.009 : 0.0035, 8, 8]} />
          <meshBasicMaterial
            color={glass ? "#bd955b" : i % 3 === 0 ? "#8b775c" : "#70695c"}
            transparent
            opacity={glass ? 0.55 : 0.44}
          />
        </mesh>
      ))}
      <Line
        points={a}
        color="#806f5f"
        transparent
        opacity={0.42}
        lineWidth={0.55}
      />
      <Line
        points={b}
        color="#8b7968"
        transparent
        opacity={0.28}
        lineWidth={0.5}
      />
      {[...a, ...b].map((p, i) => (
        <mesh key={i} position={p} scale={i % 4 === 0 ? 1.25 : 1}>
          <sphereGeometry args={[0.012, 16, 16]} />
          <meshBasicMaterial
            color={i % 4 === 0 ? "#715a43" : "#8f7c68"}
            transparent
            opacity={0.56}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Microtype sits exactly on the membrane surface, lifted a hair outward. */
function membraneTextPosition(
  p: MembraneParams,
  side: "left" | "right",
): [number, number, number] {
  const spot: [number, number] = side === "left" ? [0.05, 0.32] : [0.05, -0.3];
  const [x, y, z] = membranePoint(p, spot[0], spot[1]);
  const lift = side === "left" ? 0.025 : -0.025;
  return [x + lift, y, z];
}

function IvoryMembrane({
  side,
  explode,
  lines,
  highlighted,
  dimmed,
  onHover,
}: {
  side: "left" | "right";
  explode: number;
  lines?: [string, string];
  highlighted?: boolean;
  dimmed?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  const group = useRef<THREE.Group>(null!);
  const current = useRef(0);
  const sign = side === "left" ? -1 : 1;
  const tc = React.useContext(TuningCtx);
  const frame = useSeamFrame();
  const grain = useMembraneGrain();
  // Deep asymmetric petal: convex outer face, pinched tapered perimeter.
  const params: MembraneParams = {
    ry: 1.85,
    rz: 0.88,
    bulge: side === "left" ? -0.55 : 0.95,
    skew: side === "left" ? 0.06 : -0.06,
    pinch: 0.04,
    sweep: -0.45,
    tilt: side === "left" ? 0.1 : 0.06,
    twist: side === "left" ? 0.16 : -0.12,
    tipTaper: 0.3,
  };
  const geo = useMemo(() => makeMembraneGeometry(params), [side]);

  useFrame((_, dt) => {
    current.current = damp(current.current, explode, 5.8, dt);
    const k = THREE.MathUtils.smootherstep(current.current, 0, 1);
    group.current.position.x = THREE.MathUtils.lerp(
      sign * 0.08,
      sign * tc.ivoryOpenX,
      k,
    );
    group.current.position.y = THREE.MathUtils.lerp(
      0.1,
      side === "left" ? 0.02 : -0.02,
      k,
    );
    group.current.rotation.y = THREE.MathUtils.lerp(
      0,
      -sign * tc.ivoryOpenYaw,
      k,
    );
    group.current.rotation.z = THREE.MathUtils.lerp(0, -sign * 0.025, k);
    group.current.scale.setScalar(THREE.MathUtils.lerp(0.58, 1, k));
  });

  return (
    <group quaternion={frame.toBody}>
      <group
        ref={group}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover?.(true);
        }}
        onPointerOut={() => onHover?.(false)}
      >
        <mesh geometry={geo} castShadow>
          <meshPhysicalMaterial
            map={grain}
            bumpMap={grain}
            bumpScale={0.012}
            color={dimmed ? "#888175" : "#e7dece"}
            roughness={0.52}
            metalness={0.035}
            clearcoat={0.08}
            clearcoatRoughness={0.5}
            envMapIntensity={dimmed ? 0.2 : 0.55}
            emissive={highlighted ? "#4a3416" : "#000000"}
            emissiveIntensity={highlighted ? 0.38 : 0}
            side={THREE.DoubleSide}
          />
        </mesh>
        <MembraneRim
          params={params}
          color={dimmed ? "#766d60" : highlighted ? "#e5bd82" : "#d7cbb8"}
        />
        <EtchedRelationships params={params} flip={side === "left"} />

        <Text
          position={membraneTextPosition(params, side)}
          rotation={[0, side === "left" ? Math.PI / 2 : -Math.PI / 2, 0]}
          fontSize={0.075}
          letterSpacing={0.22}
          color={dimmed ? "#514b43" : "#756655"}
          anchorX="center"
          anchorY="middle"
        >
          {lines
            ? `${lines[0]}\n${lines[1]}`
            : side === "left"
              ? "PATTERNS\nSURFACE"
              : "TRUTH\nHOLDS"}
        </Text>
      </group>
    </group>
  );
}

const graphNodes: [number, number, number][] = [
  [0.08, 0.0, 0.0],
  [0.08, 0.3, 0.23],
  [0.08, -0.34, 0.2],
  [0.08, 0.47, -0.26],
  [0.08, -0.42, -0.32],
  [0.08, 0.09, -0.43],
];

function AmberGraph({ dimmed = false }: { dimmed?: boolean }) {
  const curves = useMemo(() => {
    return [
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.07, -0.7, 0.12),
        new THREE.Vector3(0.1, -0.3, 0.07),
        new THREE.Vector3(0.11, 0.0, 0.0),
        new THREE.Vector3(0.1, 0.31, 0.23),
        new THREE.Vector3(0.07, 0.68, 0.14),
      ]),
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.07, -0.45, -0.36),
        new THREE.Vector3(0.1, -0.15, -0.16),
        new THREE.Vector3(0.11, 0.0, 0.0),
        new THREE.Vector3(0.1, 0.24, -0.18),
        new THREE.Vector3(0.07, 0.5, -0.31),
      ]),
    ];
  }, []);

  return (
    <group>
      {curves.map((curve, i) => (
        <mesh
          key={i}
          geometry={new THREE.TubeGeometry(curve, 80, 0.0025, 6, false)}
        >
          <meshStandardMaterial
            color="#bd7025"
            emissive="#8a430c"
            emissiveIntensity={0.25}
            transparent
            opacity={dimmed ? 0.08 : 0.3}
            roughness={0.38}
            metalness={0.04}
          />
        </mesh>
      ))}

      {graphNodes.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[i === 0 ? 0.014 : 0.008, 16, 16]} />
          <meshStandardMaterial
            color={dimmed ? "#6d5638" : i === 0 ? "#ffd08a" : "#d38a32"}
            emissive={i === 0 ? "#ff8a18" : "#9a4e10"}
            emissiveIntensity={dimmed ? 0.08 : i === 0 ? 1.2 : 0.35}
            roughness={0.28}
          />
        </mesh>
      ))}
    </group>
  );
}

function GlassMembrane({
  explode,
  lines,
  highlighted,
  dimmed,
  onHover,
}: {
  explode: number;
  lines?: [string, string];
  highlighted?: boolean;
  dimmed?: boolean;
  onHover?: (hovering: boolean) => void;
}) {
  const group = useRef<THREE.Group>(null!);
  const current = useRef(0);
  const frame = useSeamFrame();
  const grain = useMembraneGrain();
  // Thin smoked-glass fin: almond silhouette, shallow bow through depth.
  const params: MembraneParams = {
    ry: 1.8,
    rz: 0.88,
    bulge: -0.4,
    skew: 0.12,
    pinch: 0.06,
    sweep: -0.6,
    tilt: -0.08,
    twist: 0.55,
    tipTaper: 0.5,
  };
  const geo = useMemo(() => makeMembraneGeometry(params), []);

  useFrame((_, dt) => {
    current.current = damp(current.current, explode, 6.0, dt);
    const t = THREE.MathUtils.smootherstep(current.current, 0, 1);
    group.current.position.x = THREE.MathUtils.lerp(0, 0, t);
    group.current.rotation.y = THREE.MathUtils.lerp(0.02, -0.15, t);
    group.current.rotation.z = THREE.MathUtils.lerp(0, 0.02, t);
    group.current.scale.setScalar(THREE.MathUtils.lerp(0.58, 1, t));
  });

  return (
    <group quaternion={frame.toBody}>
      <group
        ref={group}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover?.(true);
        }}
        onPointerOut={() => onHover?.(false)}
      >
        <mesh geometry={geo} castShadow>
          <MeshTransmissionMaterial
            bumpMap={grain}
            bumpScale={0.003}
            backside
            samples={8}
            resolution={512}
            transmission={0.88}
            thickness={0.12}
            roughness={0.14}
            chromaticAberration={0.012}
            anisotropicBlur={0.08}
            distortion={0.03}
            distortionScale={0.12}
            temporalDistortion={0}
            clearcoat={0.2}
            color={dimmed ? "#6d695f" : "#c4bfb2"}
            attenuationColor="#746857"
            attenuationDistance={4.5}
            ior={1.42}
            emissive={highlighted ? "#4a2c10" : "#000000"}
            emissiveIntensity={highlighted ? 0.48 : 0}
          />
        </mesh>
        <MembraneRim
          params={params}
          color={dimmed ? "#4f4940" : highlighted ? "#d4a66e" : "#8a7d6d"}
        />
        <EtchedRelationships params={params} glass />
        <AmberGraph dimmed={dimmed} />
        <Text
          position={(() => {
            const [x, y, z] = membranePoint(params, 0, 0.3);
            return [x + 0.025, y, z] as [number, number, number];
          })()}
          rotation={[0, Math.PI / 2, 0]}
          fontSize={0.078}
          letterSpacing={0.18}
          color={dimmed ? "#6f6254" : "#bca88d"}
          anchorX="center"
          anchorY="middle"
        >
          {lines ? `${lines[0]}\n${lines[1]}` : "LINKS\nEMERGE"}
        </Text>
      </group>
    </group>
  );
}

function BottomLabels({
  explode,
  items,
}: {
  explode: number;
  items?: { x: number; text: string }[];
}) {
  const opacity = THREE.MathUtils.smoothstep(explode, 0.62, 0.95);
  if (opacity <= 0.01) return null;

  const labels = items ?? [
    { x: -2.42, text: "Transactions" },
    { x: 0, text: "Relationships" },
    { x: 2.42, text: "Evidence" },
  ];

  return (
    <group position={[0, -1.78, 0.15]}>
      {labels.map((l) => (
        <group key={l.text} position={[l.x, 0, 0]}>
          <mesh position={[0, 0.25, 0]}>
            <boxGeometry args={[0.009, 0.26, 0.009]} />
            <meshBasicMaterial
              color="#9d968b"
              transparent
              opacity={opacity * 0.62}
            />
          </mesh>
          <Text
            fontSize={0.14}
            color="#aaa297"
            fillOpacity={opacity}
            anchorX="center"
            anchorY="top"
            position={[0, 0, 0]}
          >
            {l.text}
          </Text>
        </group>
      ))}
    </group>
  );
}

function CameraRig({
  explode,
  centered = false,
}: {
  explode: number;
  centered?: boolean;
}) {
  const t = React.useContext(TuningCtx);
  const { camera } = useThree();
  const current = useRef(0);
  const closed = useMemo(
    () => new THREE.Vector3(...t.camClosed),
    [t.camClosed],
  );
  const opened = useMemo(() => new THREE.Vector3(...t.camOpen), [t.camOpen]);
  const lookAt = useMemo(() => TUNING.camera.target.clone(), []);
  const edge = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    current.current = damp(current.current, explode, 4.5, dt);
    const k = THREE.MathUtils.smootherstep(current.current, 0, 1);
    edge.lerpVectors(closed, opened, k);
    // Dolly out on narrow viewports so the exploded row never crops.
    const aspect = (camera as THREE.PerspectiveCamera).aspect;
    const closedFit = THREE.MathUtils.clamp(0.96 / aspect, 1, 2.6);
    const openFit = THREE.MathUtils.clamp(1.2 / aspect, 1, 3.2);
    const fit = THREE.MathUtils.lerp(closedFit, openFit, k);
    lookAt.x =
      !centered && (camera as THREE.PerspectiveCamera).aspect > 1.3 ? -0.6 : 0;
    lookAt.y = -0.03;
    camera.position.copy(edge).multiplyScalar(fit);
    camera.position.x += lookAt.x;
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.fov !== t.fov) {
      persp.fov = t.fov;
      persp.updateProjectionMatrix();
    }
    camera.lookAt(lookAt);
  });
  return null;
}

function StudioEnvironment() {
  const t = React.useContext(TuningCtx);
  return (
    <>
      {/* broad reflections */}
      <Environment resolution={512} frames={1}>
        <color attach="background" args={["#0b0a08"]} />
        <Lightformer
          form="rect"
          intensity={3.4}
          color="#f2e8db"
          position={[-4.6, 4.8, 3.4]}
          rotation={[0.25, -0.5, 0.12]}
          scale={[11, 7, 1]}
        />
        <Lightformer
          form="rect"
          intensity={2.25}
          color="#c2ac91"
          position={[5.2, 1.4, -3.2]}
          rotation={[0.2, 2.2, -0.18]}
          scale={[4.8, 2.2, 1]}
        />
        <Lightformer
          form="ring"
          intensity={1.25}
          color="#7e6c57"
          position={[0, 4.2, -4.4]}
          rotation={[0.2, 0, 0]}
          scale={[3.5, 3.5, 1]}
        />
      </Environment>

      {/* actual illumination/shadow casting */}
      <ambientLight intensity={0.2} color="#d7c6af" />
      <spotLight
        castShadow
        color="#f5e7d4"
        intensity={t.keyIntensity}
        angle={t.keyAngle}
        penumbra={1}
        distance={20}
        position={t.keyPos}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00008}
      />
      <spotLight
        color="#a89073"
        intensity={36}
        angle={0.65}
        penumbra={1}
        distance={18}
        position={[5.8, 2.6, 5.2]}
      />
      <pointLight
        color="#5f4936"
        intensity={8}
        distance={8}
        position={[0, -0.8, -2.4]}
      />
    </>
  );
}

function EvidenceThread({
  explode,
  highlight,
}: {
  explode: number;
  highlight: number | null;
}) {
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.58, 0.27, 0.85),
        new THREE.Vector3(-0.97, 0.18, 0.98),
        new THREE.Vector3(0, -0.12, 1.05),
        new THREE.Vector3(1.04, 0.12, 0.95),
        new THREE.Vector3(1.6, 0.04, 0.85),
      ]),
    [],
  );
  const geometry = useMemo(
    () => new THREE.TubeGeometry(curve, 96, 0.008, 8, false),
    [curve],
  );
  const opacity =
    THREE.MathUtils.smoothstep(explode, 0.48, 0.85) *
    (highlight === null || highlight === 2 ? 1 : 0.36);
  return (
    <group
      scale={[THREE.MathUtils.lerp(0.3, 1, explode), 1, 1]}
      visible={opacity > 0.001}
    >
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#e5a044" transparent opacity={opacity} />
      </mesh>
      {[
        [-0.97, 0.18, 0.98],
        [0, -0.12, 1.05],
        [1.04, 0.12, 0.95],
      ].map((position, i) => (
        <mesh key={i} position={position as [number, number, number]}>
          <sphereGeometry args={[i === 1 ? 0.028 : 0.018, 20, 20]} />
          <meshBasicMaterial
            color={i === 1 ? "#ffe2a6" : "#eda647"}
            transparent
            opacity={opacity}
          />
        </mesh>
      ))}
    </group>
  );
}

function Assembly({
  explode,
  highlight,
  onPartHover,
  membraneText,
  bottomLabels,
}: {
  explode: number;
  highlight: number | null;
  onPartHover: (part: number | null) => void;
  membraneText: {
    left: [string, string];
    glass: [string, string];
    right: [string, string];
  };
  bottomLabels?: { x: number; text: string }[];
}) {
  const t = React.useContext(TuningCtx);
  const frame = useSeamFrame();
  const group = useRef<THREE.Group>(null!);
  const progress = useRef(0);
  const rotation = useMemo(() => new THREE.Quaternion(), []);
  const base = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  useFrame((_, dt) => {
    progress.current = damp(progress.current, explode, 5.4, dt);
    const k = THREE.MathUtils.smootherstep(progress.current, 0, 1);
    rotation.identity().slerp(frame.toOpen, k);
    base.setFromEuler(
      euler.set(t.rotX * (1 - k), t.rotY * (1 - k), t.rotZ * (1 - k)),
    );
    group.current.quaternion.copy(base).multiply(rotation);
  });
  return (
    <>
      <group ref={group} position={[0, 0.03, 0]}>
        <ShellHalf
          side="left"
          explode={explode}
          highlighted={highlight === 0}
          dimmed={highlight !== null && highlight !== 0}
          onHover={(h) => onPartHover(h ? 0 : null)}
        />
        <IvoryMembrane
          side="left"
          explode={explode}
          lines={membraneText.left}
          highlighted={highlight === 1}
          dimmed={highlight !== null && highlight !== 1}
          onHover={(h) => onPartHover(h ? 1 : null)}
        />
        <GlassMembrane
          explode={explode}
          lines={membraneText.glass}
          highlighted={highlight === 2}
          dimmed={highlight !== null && highlight !== 2}
          onHover={(h) => onPartHover(h ? 2 : null)}
        />
        <IvoryMembrane
          side="right"
          explode={explode}
          lines={membraneText.right}
          highlighted={highlight === 3}
          dimmed={highlight !== null && highlight !== 3}
          onHover={(h) => onPartHover(h ? 3 : null)}
        />
        <ShellHalf
          side="right"
          explode={explode}
          highlighted={highlight === 4}
          dimmed={highlight !== null && highlight !== 4}
          onHover={(h) => onPartHover(h ? 4 : null)}
        />
        <group quaternion={frame.toBody}>
          <EvidenceThread explode={explode} highlight={highlight} />
        </group>
      </group>
      <BottomLabels explode={explode} items={bottomLabels} />
    </>
  );
}

const DEFAULT_MEMBRANE_TEXT = {
  left: ["PATTERNS", "SURFACE"] as [string, string],
  glass: ["LINKS", "EMERGE"] as [string, string],
  right: ["TRUTH", "HOLDS"] as [string, string],
};

export function CoconutReplicaScene({
  explode = 0,
  debugOrbit = false,
  highlight = null,
  onPartHover = () => {},
  membraneText = DEFAULT_MEMBRANE_TEXT,
  bottomLabels,
  tuning,
  transparentBackground = false,
  centered = false,
}: {
  explode?: number;
  debugOrbit?: boolean;
  highlight?: number | null;
  onPartHover?: (part: number | null) => void;
  membraneText?: {
    left: [string, string];
    glass: [string, string];
    right: [string, string];
  };
  bottomLabels?: { x: number; text: string }[];
  tuning?: Partial<ArtifactTuning>;
  transparentBackground?: boolean;
  centered?: boolean;
}) {
  const active = useMemo(() => ({ ...DEFAULT_TUNING, ...tuning }), [tuning]);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: transparentBackground ? "transparent" : "#0b0a08",
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          position: TUNING.camera.closed.toArray(),
          fov: active.fov,
          near: 0.1,
          far: 60,
        }}
        gl={{
          antialias: true,
          alpha: transparentBackground,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.95,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <TuningCtx.Provider value={active}>
          {!transparentBackground && (
            <color attach="background" args={["#0b0a08"]} />
          )}
          <fog attach="fog" args={["#0b0a08", 24, 65]} />
          <StudioEnvironment />
          <CameraRig explode={explode} centered={centered} />

          <Assembly
            explode={THREE.MathUtils.clamp(explode, 0, 1)}
            highlight={highlight}
            onPartHover={onPartHover}
            membraneText={membraneText}
            bottomLabels={bottomLabels}
          />

          {debugOrbit && (
            <OrbitControls
              makeDefault
              enableDamping
              dampingFactor={0.08}
              target={TUNING.camera.target.toArray()}
              minDistance={5}
              maxDistance={15}
            />
          )}
        </TuningCtx.Provider>
      </Canvas>
    </div>
  );
}

/**
 * Example scroll wiring:
 *
 * const [explode, setExplode] = useState(0)
 * <CoconutReplicaScene explode={explode} />
 *
 * Drive `explode` from 0..1 with GSAP/ScrollTrigger or Motion useScroll.
 * IMPORTANT: do not remount the Canvas between closed/open states.
 */
