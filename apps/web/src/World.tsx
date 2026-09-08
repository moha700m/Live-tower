import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Stars, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { GameSnapshot } from '../../../packages/contracts/index.ts'
import {
  appearanceStyles,
  clamp,
  CORE_RADIUS,
  routePoint,
  SHAFT_RADIUS,
  TOWER_BASE,
  TOWER_HEIGHT,
  worldTheme,
  type Quality,
  type WorldTheme,
} from './world/theme.ts'

type WorldProps = { state: GameSnapshot; quality: Quality }
type AvatarAsset = { scene: THREE.Group; animations: THREE.AnimationClip[] }

useGLTF.preload('/models/chr-rise966.glb')

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

const tmpColor = new THREE.Color()
const tmpMatrix = new THREE.Matrix4()
const tmpPos = new THREE.Vector3()
const tmpQuat = new THREE.Quaternion()
const tmpScale = new THREE.Vector3()
const tmpLook = new THREE.Vector3()

function hexToVec(hex: string) {
  return tmpColor.set(hex).clone()
}

function makeLatticeTexture() {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#0b1014'
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = '#d7c4a4'
  ctx.lineWidth = 3
  const cell = 32
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      ctx.strokeRect(x + 5, y + 5, cell - 10, cell - 10)
      ctx.beginPath()
      ctx.moveTo(x + cell / 2, y + 5)
      ctx.lineTo(x + cell / 2, y + cell - 5)
      ctx.moveTo(x + 5, y + cell / 2)
      ctx.lineTo(x + cell - 5, y + cell / 2)
      ctx.stroke()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  texture.colorSpace = THREE.SRGBColorSpace
  texture.repeat.set(2, 12)
  return texture
}

function SkyDome({ theme }: { theme: WorldTheme }) {
  const material = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uZenith: { value: hexToVec(theme.skyZenith) },
      uHorizon: { value: hexToVec(theme.skyHorizon) },
      uNadir: { value: hexToVec(theme.skyNadir) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize((modelMatrix * vec4(position,1.0)).xyz); gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uNadir; void main(){ float h = vDir.y; vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.82, h)); col = mix(uNadir, col, smoothstep(-0.55, 0.08, h)); gl_FragColor = vec4(col, 1.0); }`,
  }), [theme.skyHorizon, theme.skyNadir, theme.skyZenith])
  useEffect(() => () => material.dispose(), [material])
  return <mesh material={material} frustumCulled={false}><sphereGeometry args={[90, 24, 16]} /></mesh>
}

function CameraRig({ state }: { state: GameSnapshot }) {
  const { camera } = useThree()
  const calm = useRef(reducedMotion())
  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1)
    const players = state.players ?? []
    const leader = players.reduce((best, p) => (p.progress > best ? p.progress : best), 0)
    const rush = state.phase === 'FINAL_RUSH'
    const podium = state.phase === 'PODIUM'
    const count = state.phase === 'COUNTDOWN' || state.phase === 'WAITING' || state.phase === 'TRANSITION'
    const bias = podium ? 2.8 : rush ? 1.2 + leader * 1.4 : leader * 0.8
    const dist = count ? 36 : podium ? 28 : rush ? 30 : 33.5
    const height = 15.2 + bias * 0.12
    const drift = calm.current ? 0 : Math.sin((state.serverNow ?? 0) * 0.00018) * 0.22
    tmpPos.set(dist * 0.7 + drift, height, dist * 0.88)
    tmpLook.set(0, 1.35 + bias * 0.28, 0)
    camera.position.lerp(tmpPos, 1 - Math.exp(-2.2 * delta))
    const currentTarget = camera.userData.look ?? tmpLook.clone()
    currentTarget.lerp(tmpLook, 1 - Math.exp(-2.0 * delta))
    camera.userData.look = currentTarget
    camera.lookAt(currentTarget)
    const persp = camera as THREE.PerspectiveCamera
    if (persp.isPerspectiveCamera) {
      const want = podium ? 26 : 28
      persp.fov += (want - persp.fov) * (1 - Math.exp(-2 * delta))
      persp.updateProjectionMatrix()
    }
  })
  return null
}

function EnergyCore({ theme, rush, podium }: { theme: WorldTheme; rush: boolean; podium: boolean }) {
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const veil = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const pulse = 1.35 + Math.sin(t * 2.1) * 0.32 + (rush ? 0.9 : 0) + (podium ? 0.5 : 0)
    if (core.current) core.current.emissiveIntensity = pulse
    if (veil.current) veil.current.opacity = 0.18 + Math.sin(t * 1.4) * 0.05 + (rush ? 0.08 : 0)
  })
  return <group>
    <mesh position={[0, TOWER_BASE + TOWER_HEIGHT / 2, 0]}>
      <cylinderGeometry args={[CORE_RADIUS + 0.08, CORE_RADIUS * 0.78, TOWER_HEIGHT + 1.4, 16]} />
      <meshStandardMaterial ref={core} color={theme.glow} emissive={theme.glow} emissiveIntensity={1.5} toneMapped={false} roughness={0.22} metalness={0.05} />
    </mesh>
    <mesh position={[0, TOWER_BASE + TOWER_HEIGHT / 2, 0]}>
      <cylinderGeometry args={[CORE_RADIUS + 0.38, CORE_RADIUS + 0.62, TOWER_HEIGHT + 1.6, 12, 1, true]} />
      <meshBasicMaterial ref={veil} color={theme.accent} transparent opacity={0.2} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  </group>
}

function Spire({ theme, quality }: { theme: WorldTheme; quality: Quality }) {
  const lattice = useMemo(() => makeLatticeTexture(), [])
  useEffect(() => () => lattice?.dispose(), [lattice])
  const storeys = quality === 'low' ? 5 : 8
  return <group>
    {Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2
      const x = Math.cos(a) * SHAFT_RADIUS
      const z = Math.sin(a) * SHAFT_RADIUS
      return <group key={i} position={[x, TOWER_BASE + TOWER_HEIGHT / 2, z]} rotation={[0, -a, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.86, TOWER_HEIGHT, 0.14]} />
          <meshStandardMaterial color={theme.stoneDark} roughness={0.62} metalness={theme.kind === 'royal' ? 0.45 : 0.12} />
        </mesh>
        <mesh position={[0, 0, 0.1]} castShadow>
          <boxGeometry args={[0.72, TOWER_HEIGHT - 0.6, 0.04]} />
          <meshStandardMaterial
            color={theme.lattice}
            roughness={0.48}
            metalness={0.28}
            map={lattice ?? undefined}
            emissive={theme.accentSoft}
            emissiveIntensity={0.12}
          />
        </mesh>
        <mesh position={[0, 0, 0.14]}>
          <boxGeometry args={[0.07, TOWER_HEIGHT - 0.4, 0.03]} />
          <meshStandardMaterial color={theme.accent} emissive={theme.accent} emissiveIntensity={0.8} toneMapped={false} />
        </mesh>
      </group>
    })}
    {Array.from({ length: 3 }, (_, i) => {
      const a = (i / 3) * Math.PI * 2 + 0.3
      return <mesh key={`fin-${i}`} position={[Math.cos(a) * 1.62, TOWER_BASE + TOWER_HEIGHT / 2, Math.sin(a) * 1.62]} rotation={[0, -a, 0]} castShadow>
        <boxGeometry args={[0.07, TOWER_HEIGHT + 0.4, 0.5]} />
        <meshStandardMaterial color={theme.metal} roughness={0.35} metalness={0.72} />
      </mesh>
    })}
    {Array.from({ length: storeys }, (_, i) => {
      const y = TOWER_BASE + 1.6 + (i / Math.max(storeys - 1, 1)) * (TOWER_HEIGHT - 3.2)
      return <mesh key={`ring-${i}`} position={[0, y, 0]} rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[1.58, 1.58, 0.11, 6]} />
        <meshStandardMaterial color={theme.stoneLight} roughness={0.4} metalness={0.22} />
      </mesh>
    })}
    <mesh position={[0, TOWER_BASE + 0.35, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[3.9, 4.6, 0.7, 6]} />
      <meshStandardMaterial color={theme.stone} roughness={0.84} metalness={0.06} />
    </mesh>
    <mesh position={[0, TOWER_BASE + 0.85, 0]} receiveShadow>
      <cylinderGeometry args={[3.05, 3.45, 0.42, 6]} />
      <meshStandardMaterial color={theme.stoneDark} roughness={0.7} metalness={0.1} />
    </mesh>
    <mesh position={[0, TOWER_BASE + 1.05, 0]} rotation={[0, Math.PI / 6, 0]}>
      <torusGeometry args={[3.15, 0.05, 6, 6]} />
      <meshBasicMaterial color={theme.glow} toneMapped={false} />
    </mesh>
  </group>
}

function Helix({ theme, leader }: { theme: WorldTheme; leader: number }) {
  const path = useMemo(() => {
    const points = Array.from({ length: 97 }, (_, i) => {
      const p = routePoint(i / 96)
      return new THREE.Vector3(p.x, p.y, p.z)
    })
    return new THREE.CatmullRomCurve3(points)
  }, [])
  const rail = useMemo(() => new THREE.TubeGeometry(path, 160, 0.08, 7, false), [path])
  const inner = useMemo(() => {
    const points = Array.from({ length: 97 }, (_, i) => {
      const p = routePoint(i / 96)
      return new THREE.Vector3(p.x * 0.78, p.y, p.z * 0.78)
    })
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 160, 0.05, 6, false)
  }, [])
  useEffect(() => () => { rail.dispose(); inner.dispose() }, [inner, rail])
  const decks = useMemo(() => Array.from({ length: 36 }, (_, i) => {
    const p = i / 35
    const point = routePoint(p)
    return { ...point, i }
  }), [])
  return <group>
    <mesh geometry={rail}><meshBasicMaterial color={theme.glow} toneMapped={false} /></mesh>
    <mesh geometry={inner}><meshStandardMaterial color={theme.accentSoft} emissive={theme.accent} emissiveIntensity={0.7} roughness={0.3} /></mesh>
    {decks.map((d) => (
      <group key={d.i} position={[d.x, d.y, d.z]} rotation={[0, -d.angle, 0.02]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[2.55, 0.16, 1.18]} />
          <meshStandardMaterial color={d.i % 2 ? theme.stoneLight : theme.stone} roughness={0.72} metalness={0.08} />
        </mesh>
        <mesh position={[0, 0.11, 0.56]}>
          <boxGeometry args={[2.55, 0.035, 0.055]} />
          <meshBasicMaterial color={d.p <= leader + 0.04 ? theme.glow : theme.accentSoft} toneMapped={false} />
        </mesh>
      </group>
    ))}
  </group>
}

function Crown({ theme, state }: { theme: WorldTheme; state: GameSnapshot }) {
  const spin = useRef<THREE.Group>(null)
  const winners = [...(state.players ?? [])].filter((p) => p.finishOrder).sort((a, b) => (a.finishOrder ?? 9) - (b.finishOrder ?? 9)).slice(0, 3)
  useFrame((_, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.35
  })
  const y = TOWER_BASE + TOWER_HEIGHT + 0.55
  return <group position={[0, y, 0]}>
    <mesh receiveShadow castShadow>
      <cylinderGeometry args={[2.55, 2.05, 0.38, 6]} />
      <meshStandardMaterial color={theme.stoneLight} metalness={0.28} roughness={0.38} />
    </mesh>
    <mesh position={[0, 0.28, 0]}>
      <torusGeometry args={[1.85, 0.055, 8, 6]} />
      <meshBasicMaterial color={theme.glow} toneMapped={false} />
    </mesh>
    <group ref={spin}>
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2
        return <mesh key={i} position={[Math.cos(a) * 1.55, 0.85, Math.sin(a) * 1.55]}>
          <boxGeometry args={[0.12, 1.45, 0.28]} />
          <meshStandardMaterial color={theme.metal} metalness={0.7} roughness={0.28} />
        </mesh>
      })}
    </group>
    <mesh position={[0, 1.55, 0]}>
      <cylinderGeometry args={[0.72, 0.95, 0.55, 6]} />
      <meshStandardMaterial color={theme.gold} emissive={theme.gold} emissiveIntensity={0.45} metalness={0.55} roughness={0.28} />
    </mesh>
    <mesh position={[0, 2.15, 0]}>
      <coneGeometry args={[0.42, 0.9, 5]} />
      <meshStandardMaterial color={theme.gold} emissive="#e78333" emissiveIntensity={0.7} metalness={0.48} roughness={0.3} />
    </mesh>
    <pointLight position={[0, 1.6, 0]} intensity={18} distance={14} color={theme.gold} />
    {winners.map((p, i) => (
      <mesh key={p.id} position={[(i - 1) * 0.78, 0.52 + (i === 0 ? 0.18 : 0), 1.05]}>
        <cylinderGeometry args={[0.32, 0.4, i === 0 ? 0.82 : 0.55, 6]} />
        <meshStandardMaterial color={i === 0 ? theme.gold : i === 1 ? '#c5d0d8' : '#b98556'} metalness={0.55} roughness={0.32} />
      </mesh>
    ))}
  </group>
}

function CheckpointArches({ theme, leader }: { theme: WorldTheme; leader: number }) {
  const gates = [0.08, 0.27, 0.47, 0.68, 0.88]
  return <group>
    {gates.map((p, i) => {
      const point = routePoint(p)
      const lit = leader >= p
      return <group key={p} position={[point.x, point.y + 0.7, point.z]} rotation={[0, -point.angle, 0]}>
        <mesh position={[-0.78, 0.1, 0]}><boxGeometry args={[0.12, 1.35, 0.12]} /><meshStandardMaterial color={theme.stoneLight} metalness={0.2} roughness={0.5} /></mesh>
        <mesh position={[0.78, 0.1, 0]}><boxGeometry args={[0.12, 1.35, 0.12]} /><meshStandardMaterial color={theme.stoneLight} metalness={0.2} roughness={0.5} /></mesh>
        <mesh position={[0, 0.82, 0]}>
          <torusGeometry args={[0.78, 0.055, 6, 14, Math.PI]} />
          <meshBasicMaterial color={lit ? theme.glow : theme.accentSoft} toneMapped={false} />
        </mesh>
        {i % 2 === 0 && <mesh position={[0, -0.55, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.22, 0.34, 16]} />
          <meshBasicMaterial color={theme.glow} transparent opacity={lit ? 0.85 : 0.25} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>}
      </group>
    })}
  </group>
}

function CityField({ theme, quality }: { theme: WorldTheme; quality: Quality }) {
  const count = quality === 'high' ? 72 : quality === 'medium' ? 48 : 28
  const buildings = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (i * 2.27) % (Math.PI * 2)
    const r = 8.5 + (i % 9) * 1.45 + (i % 3) * 0.4
    return {
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      w: 0.55 + (i % 4) * 0.28,
      h: 2.4 + ((i * 13) % 16) * 0.78,
      d: 0.5 + (i % 3) * 0.3,
      lit: i % 3 !== 1,
    }
  }), [count])
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const windowRef = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const winGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: theme.stoneDark, roughness: 0.88, metalness: 0.08 }), [theme.stoneDark])
  const winMat = useMemo(() => new THREE.MeshBasicMaterial({ color: theme.accent, toneMapped: false, transparent: true, opacity: 0.85 }), [theme.accent])
  useLayoutEffect(() => {
    buildings.forEach((b, i) => {
      tmpMatrix.compose(new THREE.Vector3(b.x, TOWER_BASE - 0.15 + b.h / 2, b.z), tmpQuat.identity(), tmpScale.set(b.w, b.h, b.d))
      meshRef.current?.setMatrixAt(i, tmpMatrix)
      if (b.lit) {
        tmpMatrix.compose(new THREE.Vector3(b.x, TOWER_BASE - 0.15 + b.h * 0.62, b.z + b.d / 2 + 0.02), tmpQuat.identity(), tmpScale.set(b.w * 0.55, 0.12, 1))
        windowRef.current?.setMatrixAt(i, tmpMatrix)
      } else {
        tmpMatrix.makeScale(0, 0, 0)
        windowRef.current?.setMatrixAt(i, tmpMatrix)
      }
    })
    if (meshRef.current) meshRef.current.instanceMatrix.needsUpdate = true
    if (windowRef.current) windowRef.current.instanceMatrix.needsUpdate = true
  }, [buildings])
  useEffect(() => () => { geo.dispose(); winGeo.dispose(); mat.dispose(); winMat.dispose() }, [geo, mat, winGeo, winMat])
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, TOWER_BASE - 0.48, 0]} receiveShadow>
      <circleGeometry args={[42, 32]} />
      <meshStandardMaterial color={theme.ground} roughness={1} metalness={theme.kind === 'city' ? 0.18 : 0.02} />
    </mesh>
    <instancedMesh ref={meshRef} args={[geo, mat, buildings.length]} castShadow receiveShadow />
    <instancedMesh ref={windowRef} args={[winGeo, winMat, buildings.length]} />
    <Skyline theme={theme} quality={quality} />
  </group>
}

function Skyline({ theme, quality }: { theme: WorldTheme; quality: Quality }) {
  const count = quality === 'low' ? 18 : 32
  const towers = useMemo(() => Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + 0.11
    const r = 18 + (i % 5) * 1.8
    return {
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      w: 0.7 + (i % 3) * 0.35,
      h: 5.5 + ((i * 9) % 12) * 0.85,
      d: 0.6 + (i % 2) * 0.4,
    }
  }), [count])
  const ref = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: theme.skyNadir, roughness: 1, metalness: 0 }), [theme.skyNadir])
  useLayoutEffect(() => {
    towers.forEach((b, i) => {
      tmpMatrix.compose(new THREE.Vector3(b.x, TOWER_BASE - 0.2 + b.h / 2, b.z), tmpQuat.identity(), tmpScale.set(b.w, b.h, b.d))
      ref.current?.setMatrixAt(i, tmpMatrix)
    })
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true
  }, [towers])
  useEffect(() => () => { geo.dispose(); mat.dispose() }, [geo, mat])
  return <instancedMesh ref={ref} args={[geo, mat, towers.length]} />
}

function WorldDecor({ theme, quality }: { theme: WorldTheme; quality: Quality }) {
  if (theme.kind === 'canyon') {
    const rocks = quality === 'low' ? 6 : 10
    return <group>
      {Array.from({ length: rocks }, (_, i) => (
        <mesh key={i} position={[(i % 2 ? -1 : 1) * (4.8 + (i % 4) * 0.7), TOWER_BASE + 0.8 + (i % 5) * 3.1, ((i % 3) - 1) * 2.4]} rotation={[0.15, i * 0.7, 0.1]} castShadow>
          <dodecahedronGeometry args={[1.05 + (i % 3) * 0.35, 0]} />
          <meshStandardMaterial color={i % 2 ? theme.stoneLight : theme.stone} roughness={0.96} />
        </mesh>
      ))}
    </group>
  }
  if (theme.kind === 'najdi') {
    return <group>
      {Array.from({ length: 8 }, (_, i) => {
        const a = i * Math.PI / 4 + 0.2
        return <group key={i} position={[Math.cos(a) * 5.1, TOWER_BASE + 1.1 + (i % 4) * 4.2, Math.sin(a) * 5.1]} rotation={[0, -a, 0]}>
          <mesh position={[-0.7, 0.7, 0]}><boxGeometry args={[0.28, 2.2, 0.28]} /><meshStandardMaterial color={theme.stoneLight} roughness={0.82} /></mesh>
          <mesh position={[0.7, 0.7, 0]}><boxGeometry args={[0.28, 2.2, 0.28]} /><meshStandardMaterial color={theme.stoneLight} roughness={0.82} /></mesh>
          <mesh position={[0, 1.7, 0]}><boxGeometry args={[1.7, 0.22, 0.28]} /><meshStandardMaterial color={theme.stone} /></mesh>
          {[-0.5, 0, 0.5].map((x) => <mesh key={x} position={[x, 2.05, 0]}><boxGeometry args={[0.22, 0.42, 0.18]} /><meshStandardMaterial color={theme.stoneLight} /></mesh>)}
        </group>
      })}
    </group>
  }
  if (theme.kind === 'sky') {
    return <group>
      {Array.from({ length: quality === 'low' ? 6 : 10 }, (_, i) => (
        <group key={i} position={[Math.cos(i * 2.1) * (5.2 + i % 3), TOWER_BASE + 2 + (i % 7) * 3.2, Math.sin(i * 2.1) * (5.2 + i % 2)]}>
          <mesh><sphereGeometry args={[0.95 + (i % 3) * 0.35, 10, 7]} /><meshStandardMaterial color="#f4fff8" roughness={1} /></mesh>
          <mesh position={[0, -0.85, 0]}><cylinderGeometry args={[0.08, 0.16, 0.7, 6]} /><meshStandardMaterial color="#5c9e76" /></mesh>
        </group>
      ))}
    </group>
  }
  if (theme.kind === 'royal') {
    return <group>
      {Array.from({ length: 6 }, (_, i) => (
        <group key={i} position={[Math.cos(i * 1.05) * 5.2, TOWER_BASE + 2.2 + i * 3.4, Math.sin(i * 1.05) * 5.2]} rotation={[0, i, 0]}>
          <mesh><torusGeometry args={[1.05, 0.05, 8, 24]} /><meshBasicMaterial color={theme.gold} toneMapped={false} /></mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.62, 0.035, 8, 18]} /><meshBasicMaterial color={theme.accent} toneMapped={false} /></mesh>
        </group>
      ))}
    </group>
  }
  return <group>
    {Array.from({ length: 6 }, (_, i) => {
      const a = i * Math.PI / 3 + 0.4
      return <group key={i} position={[Math.cos(a) * 5.4, TOWER_BASE + 2.4 + (i % 3) * 5.2, Math.sin(a) * 5.4]} rotation={[0, -a, 0]}>
        <mesh position={[-0.9, 0.2, 0]}><boxGeometry args={[0.22, 2.4, 0.22]} /><meshStandardMaterial color={theme.stone} metalness={0.15} roughness={0.6} /></mesh>
        <mesh position={[0.9, 0.2, 0]}><boxGeometry args={[0.22, 2.4, 0.22]} /><meshStandardMaterial color={theme.stone} metalness={0.15} roughness={0.6} /></mesh>
        <mesh position={[0, 1.35, 0]}>
          <torusGeometry args={[0.9, 0.08, 6, 12, Math.PI]} />
          <meshStandardMaterial color={theme.stoneLight} metalness={0.2} roughness={0.5} />
        </mesh>
      </group>
    })}
  </group>
}

function Atmosphere({ theme, quality, rush, storm }: { theme: WorldTheme; quality: Quality; rush: boolean; storm: boolean }) {
  const count = quality === 'low' ? 80 : quality === 'medium' ? 160 : 240
  const positions = useMemo(() => {
    const data = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2
      const r = 1.6 + Math.random() * 10
      data[i * 3] = Math.cos(a) * r
      data[i * 3 + 1] = TOWER_BASE + Math.random() * TOWER_HEIGHT * 1.15
      data[i * 3 + 2] = Math.sin(a) * r
    }
    return data
  }, [count])
  const ref = useRef<THREE.Points>(null)
  useFrame((_, delta) => {
    if (!ref.current) return
    ref.current.rotation.y += delta * (rush || storm ? 0.08 : 0.025)
  })
  const night = theme.kind !== 'sky'
  return <group>
    {night && <Stars radius={70} depth={28} count={quality === 'high' ? 900 : quality === 'medium' ? 420 : 180} factor={2.1} saturation={0.15} fade speed={0.28} />}
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={theme.particle} size={storm ? 0.09 : 0.045} transparent opacity={storm ? 0.55 : 0.35} depthWrite={false} sizeAttenuation />
    </points>
  </group>
}

function Avatar({ player, index, theme, asset, phase }: { player: GameSnapshot['players'][number]; index: number; theme: WorldTheme; asset: AvatarAsset; phase: GameSnapshot['phase'] }) {
  const ref = useRef<THREE.Group>(null)
  const model = useMemo(() => {
    const next = cloneSkeleton(asset.scene) as THREE.Group
    next.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      object.material = Array.isArray(object.material)
        ? object.material.map((entry) => entry.clone())
        : object.material.clone()
    })
    return next
  }, [asset.scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model])
  const actions = useMemo(() => new Map(asset.animations.map((clip) => [clip.name, mixer.clipAction(clip)])), [asset.animations, mixer])
  const appearanceIndex = String(player.appearance ?? index).split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  const style = appearanceStyles[Math.abs(appearanceIndex) % appearanceStyles.length]
  const p = clamp(Number(player.progress ?? 0), 0, 1)
  const point = routePoint(p, index * 0.055)
  const isWinner = Boolean(player.finishOrder)
  const isBoosting = Number(player.boostUntil ?? 0) > Date.now()
  const pose = isWinner ? 'celebrate' : isBoosting ? 'jump' : phase === 'ACTIVE' || phase === 'FINAL_RUSH' ? 'run' : 'idle'
  useLayoutEffect(() => {
    model.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const semanticName = `${object.name}:${Array.isArray(object.material) ? object.material.map((entry) => entry.name).join(':') : object.material.name}`.toLowerCase()
      const color = semanticName.includes('head') || semanticName.includes('skin') ? style.skin
        : semanticName.includes('hair') || semanticName.includes('scarf') ? style.scarf
          : semanticName.includes('leg') || semanticName.includes('pant') ? style.pants
            : semanticName.includes('belt') || semanticName.includes('accent') ? style.accent
              : style.shirt
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((entry) => {
        if (entry instanceof THREE.MeshStandardMaterial) {
          entry.color.set(color)
          entry.emissive.set(color === style.accent ? color : '#000000')
          entry.emissiveIntensity = color === style.accent ? 0.22 : 0
        }
      })
    })
  }, [model, style])
  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(model) }, [mixer, model])
  useEffect(() => {
    const action = actions.get(pose)
    if (!action) return
    if (pose !== 'jump') model.position.y = 0
    action.reset().fadeIn(0.16).play()
    return () => { action.fadeOut(0.16) }
  }, [actions, pose])
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.position.set(point.x, point.y + 0.2, point.z)
      ref.current.rotation.y = -point.angle + Math.PI / 2
    }
    mixer.update(Math.min(delta, 0.1))
  })
  return <group ref={ref} position={[point.x, point.y + 0.2, point.z]}>
    {isBoosting && <mesh position={[0, 0.3, -0.38]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.26, 0.03, 6, 18]} />
      <meshBasicMaterial color={theme.glow} transparent opacity={0.9} toneMapped={false} />
    </mesh>}
    <primitive object={model} />
    {isWinner && <mesh position={[0, 1.05, 0]} rotation={[0, Math.PI / 4, 0]}>
      <torusGeometry args={[0.13, 0.028, 5, 5]} />
      <meshStandardMaterial color={theme.gold} emissive={theme.gold} emissiveIntensity={0.45} />
    </mesh>}
    <Html position={[0, 1.16, 0]} center distanceFactor={9} className="avatar-label" occlude={false}>
      <span data-viewer={player.id} data-progress={player.progress} data-pose={pose}>{player.name}</span>
    </Html>
  </group>
}

function Lights({ theme, quality, rush }: { theme: WorldTheme; quality: Quality; rush: boolean }) {
  return <>
    <hemisphereLight args={[theme.fill, theme.ground, theme.kind === 'sky' ? 1.1 : 0.55]} />
    <ambientLight intensity={theme.kind === 'sky' ? 0.72 : 0.38} color={theme.ambient} />
    <directionalLight
      position={[10, 22, 14]}
      intensity={theme.kind === 'sky' ? 2.6 : 1.85}
      color={theme.key}
      castShadow={quality !== 'low'}
      shadow-mapSize={[quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024]}
      shadow-camera-near={2}
      shadow-camera-far={50}
      shadow-camera-left={-18}
      shadow-camera-right={18}
      shadow-camera-top={20}
      shadow-camera-bottom={-16}
      shadow-bias={-0.00025}
    />
    <directionalLight position={[-12, 8, -6]} intensity={0.55} color={theme.rim} />
    <pointLight position={[0, 6, 0]} intensity={rush ? 48 : 28} distance={18} color={theme.accent} />
  </>
}

function WorldScene({ state, quality }: WorldProps) {
  const avatarAsset = useGLTF('/models/chr-rise966.glb') as unknown as AvatarAsset
  const theme = worldTheme(state.worldIndex)
  const players = (state.players ?? []).slice(0, 30)
  const leader = players.reduce((best, p) => (p.progress > best ? p.progress : best), 0)
  const rush = state.phase === 'FINAL_RUSH'
  const podium = state.phase === 'PODIUM'
  const storm = Number(state.sandstormUntil ?? 0) > (state.serverNow ?? Date.now())
  return <>
    <color attach="background" args={[theme.skyZenith]} />
    <fog attach="fog" args={[theme.fog, storm ? theme.fogNear * 0.55 : theme.fogNear, storm ? theme.fogFar * 0.7 : theme.fogFar]} />
    <SkyDome theme={theme} />
    <Lights theme={theme} quality={quality} rush={rush} />
    <EnergyCore theme={theme} rush={rush} podium={podium} />
    <Spire theme={theme} quality={quality} />
    <Helix theme={theme} leader={leader} />
    <CheckpointArches theme={theme} leader={leader} />
    <CityField theme={theme} quality={quality} />
    <WorldDecor theme={theme} quality={quality} />
    <Atmosphere theme={theme} quality={quality} rush={rush} storm={storm} />
    <Crown theme={theme} state={state} />
    {players.map((player, i) => <Avatar key={player.id} player={player} index={i} theme={theme} asset={avatarAsset} phase={state.phase} />)}
    <CameraRig state={state} />
  </>
}

export default function World({ state, quality }: WorldProps) {
  const shadows = quality !== 'low'
  return <Canvas
    dpr={quality === 'high' ? [1, 1.75] : quality === 'medium' ? [1, 1.25] : 1}
    shadows={shadows}
    gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
    camera={{ position: [23.5, 15.2, 29.5], fov: 28, near: 0.1, far: 180 }}
    style={{ width: '100%', height: '100%', display: 'block' }}
  >
    <WorldScene state={state} quality={quality} />
  </Canvas>
}
