import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Stars, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { GameSnapshot } from '../../../packages/contracts/index.ts'

type Quality = 'high' | 'medium' | 'low'
type WorldProps = { state: GameSnapshot; quality: Quality }

type Palette = {
  name: string
  stone: string
  stoneLight: string
  accent: string
  accentSoft: string
  sky: string
  ground: string
  metal: string
  glow: string
}

const PALETTES: Palette[] = [
  { name: 'Riyadh Night', stone: '#182b3b', stoneLight: '#34566a', accent: '#5df2df', accentSoft: '#1c9d9a', sky: '#071421', ground: '#091826', metal: '#9ad9dc', glow: '#67fff0' },
  { name: 'Diriyah', stone: '#9c6842', stoneLight: '#d19b62', accent: '#5df2df', accentSoft: '#379ea0', sky: '#251a1a', ground: '#3d211c', metal: '#f2c78b', glow: '#ffbe6e' },
  { name: 'AlUla', stone: '#875444', stoneLight: '#c3845a', accent: '#ffe29e', accentSoft: '#d1754b', sky: '#281c2a', ground: '#412626', metal: '#f9ca75', glow: '#ffc66b' },
  { name: 'Sky Oasis', stone: '#a2c9c8', stoneLight: '#dcf4e6', accent: '#50e4ff', accentSoft: '#46adaf', sky: '#10273d', ground: '#173447', metal: '#d7ffff', glow: '#b7ffff' },
  { name: 'Future 966', stone: '#292347', stoneLight: '#6356a0', accent: '#63f8ff', accentSoft: '#9c65ff', sky: '#100c28', ground: '#1c1338', metal: '#d6b9ff', glow: '#cf7eff' },
]

const appearanceStyles = [
  { shirt: '#e8d8b9', pants: '#c6b28f', scarf: '#f7efe0', skin: '#a96f4e', accent: '#24354b' },
  { shirt: '#192d38', pants: '#101d2a', scarf: '#e8c77c', skin: '#8c583d', accent: '#5df2df' },
  { shirt: '#a12b40', pants: '#f0e1bd', scarf: '#f4ecda', skin: '#bb7c54', accent: '#2c3558' },
  { shirt: '#e9dfcd', pants: '#5a4239', scarf: '#c85c58', skin: '#9d6748', accent: '#f2b14b' },
  { shirt: '#4b9bb0', pants: '#203b54', scarf: '#d3f7ec', skin: '#b77b56', accent: '#f7d86c' },
  { shirt: '#ef884e', pants: '#35274f', scarf: '#ffcf87', skin: '#a46745', accent: '#66eff0' },
  { shirt: '#323e6d', pants: '#181d39', scarf: '#e4b7ff', skin: '#82523f', accent: '#8c79ff' },
  { shirt: '#efeee2', pants: '#e5d7bd', scarf: '#2b5d68', skin: '#9b6042', accent: '#41caca' },
  { shirt: '#792d5a', pants: '#302139', scarf: '#ef9fc1', skin: '#ac7450', accent: '#7af4df' },
  { shirt: '#f0b52e', pants: '#15344b', scarf: '#4ce4e6', skin: '#8f583d', accent: '#ef7b5d' },
  { shirt: '#b7c8d0', pants: '#8a9ba7', scarf: '#f6e8c0', skin: '#a87050', accent: '#a56dff' },
  { shirt: '#2a262f', pants: '#13131b', scarf: '#a4fff1', skin: '#915c44', accent: '#ffcb67' },
]

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const routePoint = (progress: number, offset = 0) => {
  const p = clamp(progress, 0, 1)
  const angle = p * Math.PI * 9.2 + offset
  const radius = 2.15
  return { x: Math.cos(angle) * radius, y: -11.1 + p * 24, z: Math.sin(angle) * radius, angle }
}

function CameraRig() {
  const { camera, size } = useThree()
  useLayoutEffect(() => {
    const c = camera as THREE.OrthographicCamera
    c.zoom = Math.min(size.height / 36, size.width / 16)
    c.updateProjectionMatrix()
  }, [camera, size.height, size.width])
  useFrame(({ clock }) => {
    const c = camera as THREE.OrthographicCamera
    const drift = Math.sin(clock.getElapsedTime() * 0.1) * 0.1
    c.position.set(29 + drift, 20 + drift * 0.25, 32)
    c.lookAt(0, 1, 0)
  })
  return null
}

function CityGlow({ palette }: { palette: Palette }) {
  const buildings = useMemo(() => Array.from({ length: 64 }, (_, i) => ({
    x: ((i * 17) % 23) - 11,
    z: ((i * 29) % 19) - 9,
    w: 0.45 + (i % 4) * 0.24,
    h: 1.2 + ((i * 7) % 8) * 0.42,
    d: 0.5 + (i % 3) * 0.25,
  })).filter((b) => Math.abs(b.x) > 3.6 || Math.abs(b.z) > 3.6), [])
  const buildingRef = useRef<THREE.InstancedMesh>(null)
  const windowRef = useRef<THREE.InstancedMesh>(null)
  const buildingGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const windowGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const buildingMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: palette.stone, roughness: 0.9 }), [palette.stone])
  const windowMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: palette.accent, toneMapped: false }), [palette.accent])
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4()
    buildings.forEach((b, i) => {
      matrix.compose(new THREE.Vector3(b.x, b.h / 2, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.d))
      buildingRef.current?.setMatrixAt(i, matrix)
      if (i % 2 === 0) {
        matrix.compose(new THREE.Vector3(b.x, 0.15, b.z + b.d / 2 + 0.006), new THREE.Quaternion(), new THREE.Vector3(b.w * 0.48, 0.08, 1))
        windowRef.current?.setMatrixAt(i, matrix)
      } else matrix.makeScale(0, 0, 0)
      if (i % 2 !== 0) windowRef.current?.setMatrixAt(i, matrix)
    })
    if (buildingRef.current) buildingRef.current.instanceMatrix.needsUpdate = true
    if (windowRef.current) windowRef.current.instanceMatrix.needsUpdate = true
  }, [buildings])
  return <group position={[0, -12.9, 0]}>
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[48, 38]} />
      <meshStandardMaterial color={palette.ground} roughness={1} />
    </mesh>
    <instancedMesh ref={buildingRef} args={[buildingGeometry, buildingMaterial, buildings.length]} castShadow receiveShadow />
    <instancedMesh ref={windowRef} args={[windowGeometry, windowMaterial, buildings.length]} />
  </group>
}

function Ribbon({ palette, width, edge = false, side = 'outer' }: { palette: Palette; width: number; edge?: boolean; side?: 'outer' | 'inner' }) {
  const geometry = useMemo(() => {
    const vertices: number[] = []
    const indices: number[] = []
    const samples = 96
    for (let i = 0; i <= samples; i += 1) {
      const p = i / samples
      const angle = p * Math.PI * 9.2
      const radius = 2.15
      const edgeRadius = edge ? radius + (side === 'outer' ? 0.78 : -0.78) : radius
      vertices.push(Math.cos(angle) * (edgeRadius + (edge ? width / 2 : 0)), -11.1 + p * 24 + (edge ? 0.035 : 0), Math.sin(angle) * (edgeRadius + (edge ? width / 2 : 0)))
      if (edge) vertices.push(Math.cos(angle) * (edgeRadius - width / 2), -11.1 + p * 24 + 0.035, Math.sin(angle) * (edgeRadius - width / 2))
      if (!edge) {
        vertices.push(Math.cos(angle) * (radius - width), -11.1 + p * 24 + 0.015, Math.sin(angle) * (radius - width))
      }
    }
    for (let i = 0; i < samples; i += 1) {
      const n = i * 2
      indices.push(n, n + 1, n + 3, n, n + 3, n + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    g.setIndex(indices)
    g.computeVertexNormals()
    return g
  }, [edge, side, width])
  return <mesh geometry={geometry} receiveShadow castShadow>
    <meshStandardMaterial color={edge ? palette.accent : palette.stoneLight} emissive={edge ? palette.accent : '#000000'} emissiveIntensity={edge ? 0.65 : 0} roughness={0.78} metalness={edge ? 0.15 : 0.02} toneMapped={!edge} />
  </mesh>
}

function OpenTower({ palette, theme }: { palette: Palette; theme: number }) {
  return <group>
    {[-1, 1].flatMap((x) => [-1, 1].map((z) => <mesh key={`${x}-${z}`} position={[x * 0.98, 1.2, z * 0.98]} castShadow>
      <boxGeometry args={[0.2, 25.4, 0.2]} />
      <meshStandardMaterial color={palette.stone} roughness={0.72} metalness={theme === 4 ? 0.32 : 0.03} />
    </mesh>))}
    {Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[0, -10.2 + i * 3.8, 0]} rotation={[Math.PI / 2, 0, Math.PI / 4]}>
      <torusGeometry args={[1.42, 0.065, 6, 4]} />
      <meshStandardMaterial color={palette.stoneLight} roughness={0.7} metalness={theme === 4 ? 0.42 : 0.08} />
    </mesh>)}
  </group>
}

function Route({ palette, theme }: { palette: Palette; theme: number }) {
  const levels = useMemo(() => Array.from({ length: 24 }, (_, i) => {
    const p = i / 23
    const angle = p * Math.PI * 9.2
    return { p, angle, y: -11.1 + p * 24 }
  }), [])
  return <group>
    <OpenTower palette={palette} theme={theme} />
    <Ribbon palette={palette} width={1.52} />
    <Ribbon palette={palette} width={0.1} edge side="outer" />
    <Ribbon palette={palette} width={0.1} edge side="inner" />
    {levels.map(({ angle, y }, i) => {
      const x = Math.cos(angle) * 2.2
      const z = Math.sin(angle) * 2.2
      return <group key={i} position={[x, y, z]} rotation={[0, -angle, 0]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[2.6, 0.2, 1.12]} />
          <meshStandardMaterial color={i % 3 === 0 ? palette.stoneLight : palette.stone} roughness={0.8} />
        </mesh>
        {i % 4 === 0 && <Crenellation palette={palette} />}
      </group>
    })}
    <Ramps palette={palette} />
  </group>
}

function Crenellation({ palette }: { palette: Palette }) {
  return <group position={[0, 0.25, -0.56]}>
    {[-0.85, 0, 0.85].map((x) => <mesh key={x} position={[x, 0.18, 0]}>
      <boxGeometry args={[0.3, 0.36, 0.18]} />
      <meshStandardMaterial color={palette.stoneLight} roughness={0.78} />
    </mesh>)}
  </group>
}

function Ramps({ palette }: { palette: Palette }) {
  const ramps = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const p = (i + 0.4) / 8
    const angle = p * Math.PI * 9.2
    return [Math.cos(angle) * 2.12, -11.1 + p * 24 + 0.25, Math.sin(angle) * 2.12, -angle] as [number, number, number, number]
  }), [])
  return <>{ramps.map((r, i) => <group key={i} position={[r[0], r[1], r[2]]} rotation={[0, r[3], -0.17]}>
    <mesh>
      <boxGeometry args={[2.1, 0.12, 0.72]} />
      <meshStandardMaterial color={palette.stoneLight} roughness={0.72} />
    </mesh>
  </group>)}</>
}

function CourseObstacles({ palette }: { palette: Palette }) {
  const checkpoints = [0.08, 0.27, 0.47, 0.68, 0.86]
  return <group>
    <mesh position={[2.15, -10.84, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.72, 0.1, 8, 24]} />
      <meshBasicMaterial color={palette.glow} toneMapped={false} />
    </mesh>
    {checkpoints.map((p, i) => <RotatingGate key={p} palette={palette} progress={p} index={i} />)}
  </group>
}

function RotatingGate({ palette, progress, index }: { palette: Palette; progress: number; index: number }) {
  const ref = useRef<THREE.Group>(null)
  const point = routePoint(progress)
  useFrame(({ clock }) => {
    if (ref.current) ref.current.rotation.z = clock.getElapsedTime() * (index % 2 ? -0.75 : 0.55)
  })
  return <group ref={ref} position={[point.x, point.y + 0.48, point.z]} rotation={[0, -point.angle, 0]}>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[0.72, 0.07, 8, 20]} />
      <meshBasicMaterial color={palette.accent} toneMapped={false} />
    </mesh>
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[1.55, 0.07, 0.07]} />
      <meshBasicMaterial color={palette.glow} toneMapped={false} />
    </mesh>
    {index % 2 === 0 && <mesh position={[0, -0.45, 0]} rotation={[0, 0, 0]}>
      <cylinderGeometry args={[0.33, 0.42, 0.08, 12]} />
      <meshStandardMaterial color={palette.accentSoft} emissive={palette.accent} emissiveIntensity={0.7} />
    </mesh>}
  </group>
}

function ThemeDecor({ theme, palette }: { theme: number; palette: Palette }) {
  const arches = Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3 + 0.25
    return { x: Math.cos(a) * 4.1, y: -8.5 + i * 4.6, z: Math.sin(a) * 4.1, a }
  })
  if (theme === 2) return <group>{Array.from({ length: 7 }, (_, i) => <mesh key={i} position={[(i % 2 ? -1 : 1) * (3.8 + (i % 3) * 0.6), -9 + i * 3.4, (i % 3 - 1) * 1.2]} rotation={[0, i, 0]}>
    <dodecahedronGeometry args={[1.1 + (i % 2) * 0.45, 0]} />
    <meshStandardMaterial color={i % 2 ? palette.stoneLight : palette.stone} roughness={1} />
  </mesh>)}</group>
  if (theme === 3) return <group>{Array.from({ length: 9 }, (_, i) => <group key={i} position={[Math.cos(i * 2.4) * 4.5, -8 + (i % 6) * 4, Math.sin(i * 2.4) * 4.5]}>
    <mesh><sphereGeometry args={[0.82, 10, 6]} /><meshStandardMaterial color="#eef9ed" roughness={0.95} /></mesh>
    <mesh position={[0, -0.75, 0]}><cylinderGeometry args={[0.09, 0.14, 0.6, 6]} /><meshStandardMaterial color="#5c9e76" /></mesh>
  </group>)}</group>
  if (theme === 4) return <group>{Array.from({ length: 5 }, (_, i) => <group key={i} position={[Math.cos(i * 1.25) * 4.5, -8 + i * 4.9, Math.sin(i * 1.25) * 4.5]} rotation={[0, i, 0]}>
    <mesh><torusGeometry args={[1.05, 0.08, 8, 24]} /><meshBasicMaterial color={palette.accent} toneMapped={false} /></mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.62, 0.045, 8, 18]} /><meshBasicMaterial color={palette.accentSoft} toneMapped={false} /></mesh>
  </group>)}</group>
  return <group>{arches.map((a, i) => <group key={i} position={[a.x, a.y, a.z]} rotation={[0, -a.a, 0]}>
    <mesh position={[-0.85, 0, 0]}><boxGeometry args={[0.32, 2.1, 0.32]} /><meshStandardMaterial color={palette.stoneLight} /></mesh>
    <mesh position={[0.85, 0, 0]}><boxGeometry args={[0.32, 2.1, 0.32]} /><meshStandardMaterial color={palette.stoneLight} /></mesh>
    <mesh position={[0, 0.9, 0]}><torusGeometry args={[0.85, 0.17, 6, 12, Math.PI]} /><meshStandardMaterial color={palette.stoneLight} /></mesh>
  </group>)}</group>
}

function Palms({ palette }: { palette: Palette }) {
  const palms = [[-5.2, -10.2, 2.8], [5.1, -8.5, -2.6], [-5.5, 2.6, -1.2], [5.2, 7.3, 1.7]] as const
  return <group>
    {palms.map(([x, y, z], i) => <group key={i} position={[x, y, z]} rotation={[0, i * 1.7, 0]}>
      <mesh position={[0, 0.75, 0]} rotation={[0, 0, i % 2 ? -0.08 : 0.08]}>
        <cylinderGeometry args={[0.1, 0.16, 1.65, 7]} />
        <meshStandardMaterial color={palette.stoneLight} roughness={0.9} />
      </mesh>
      {Array.from({ length: 6 }, (_, leaf) => <mesh key={leaf} position={[Math.cos(leaf * Math.PI / 3) * 0.45, 1.6, Math.sin(leaf * Math.PI / 3) * 0.45]} rotation={[0.2, leaf * Math.PI / 3, -0.55]}>
        <coneGeometry args={[0.09, 0.95, 5]} />
        <meshStandardMaterial color={i % 2 ? '#65b685' : '#4f9a77'} roughness={0.9} />
      </mesh>)}
    </group>)}
  </group>
}

function Crown({ palette, state }: { palette: Palette; state: GameSnapshot }) {
  const winners = [...(state.players ?? [])].filter((p) => p.finishOrder).sort((a, b) => (a.finishOrder ?? 9) - (b.finishOrder ?? 9)).slice(0, 3)
  return <group position={[0, 13.8, 0]}>
    <mesh receiveShadow castShadow><cylinderGeometry args={[3.5, 2.7, 0.42, 12]} /><meshStandardMaterial color={palette.stoneLight} metalness={0.15} roughness={0.42} /></mesh>
    <mesh position={[0, 0.27, 0]}><torusGeometry args={[2.7, 0.08, 8, 48]} /><meshBasicMaterial color={palette.glow} toneMapped={false} /></mesh>
    <mesh position={[0, 0.72, 0]} rotation={[0, 0, 0]}><coneGeometry args={[0.72, 1.1, 5]} /><meshStandardMaterial color="#ffc86b" emissive="#e78333" emissiveIntensity={0.55} metalness={0.4} /></mesh>
    {winners.map((p, i) => <mesh key={p.id} position={[(i - 1) * 0.8, 0.57 + (i === 0 ? 0.22 : 0), 0.9]}>
      <cylinderGeometry args={[0.38, 0.47, i === 0 ? 0.9 : 0.62, 8]} /><meshStandardMaterial color={i === 0 ? '#ffc86b' : i === 1 ? '#ced9e0' : '#b98556'} metalness={0.5} roughness={0.34} />
    </mesh>)}
  </group>
}

type AvatarAsset = { scene: THREE.Group; animations: THREE.AnimationClip[] }

function Avatar({ player, index, palette, asset, phase }: { player: GameSnapshot['players'][number]; index: number; palette: Palette; asset: AvatarAsset; phase: GameSnapshot['phase'] }) {
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
  const kind = Math.abs(appearanceIndex) % appearanceStyles.length
  const style = appearanceStyles[kind]
  const p = clamp(Number(player.progress ?? 0), 0, 1)
  const point = routePoint(p, index * 0.06)
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
          entry.emissiveIntensity = color === style.accent ? 0.18 : 0
        }
      })
    })
  }, [model, style])
  useEffect(() => () => {
    mixer.stopAllAction()
    mixer.uncacheRoot(model)
  }, [mixer, model])
  useEffect(() => {
    const action = actions.get(pose)
    if (!action) return
    if (pose !== 'jump') model.position.y = 0
    action.reset().fadeIn(0.16).play()
    return () => { action.fadeOut(0.16) }
  }, [actions, pose])
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.position.y = point.y + 0.18
      ref.current.rotation.y = -point.angle + Math.PI / 2
    }
    mixer.update(delta)
  })
  return <group ref={ref} position={[point.x, point.y + 0.18, point.z]}>
    {isBoosting && <mesh position={[0, 0.34, -0.42]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.24, 0.028, 6, 18]} /><meshBasicMaterial color={palette.glow} transparent opacity={0.8} toneMapped={false} /></mesh>}
    <primitive object={model} />
    {isWinner && <mesh position={[0, 1.02, 0]} rotation={[0, Math.PI / 4, 0]}><torusGeometry args={[0.12, 0.03, 5, 5]} /><meshStandardMaterial color="#ffc86b" emissive="#ffc86b" emissiveIntensity={0.3} /></mesh>}
    <Html position={[0, 1.12, 0]} center distanceFactor={10} className="avatar-label" occlude={false}>
      <span data-viewer={player.id} data-progress={player.progress} data-pose={pose}>{player.name}</span>
    </Html>
  </group>
}

function WorldScene({ state, quality }: WorldProps) {
  const avatarAsset = useGLTF('/models/chr-rise966.glb') as unknown as AvatarAsset
  const theme = Math.abs(Number(state.worldIndex ?? 0)) % PALETTES.length
  const palette = PALETTES[theme]
  const players = (state.players ?? []).slice(0, 30)
  return <>
    <color attach="background" args={[palette.sky]} />
    <fog attach="fog" args={[palette.sky, 45, 100]} />
    <ambientLight intensity={0.62} color="#bfd2db" />
    <directionalLight position={[8, 22, 12]} intensity={2.4} color="#ffe0b0" castShadow={quality !== 'low'} shadow-mapSize={[quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024]} />
    <pointLight position={[0, 7, 1]} intensity={35} distance={16} color={palette.accent} />
    <Stars radius={45} depth={24} count={quality === 'high' ? 800 : 360} factor={1.6} saturation={0.2} fade speed={0.35} />
    <CityGlow palette={palette} />
    <Route palette={palette} theme={theme} />
    <CourseObstacles palette={palette} />
    <ThemeDecor theme={theme} palette={palette} />
    <Palms palette={palette} />
    <Crown palette={palette} state={state} />
    {players.map((player, i) => <Avatar key={player.id} player={player} index={i} palette={palette} asset={avatarAsset} phase={state.phase} />)}
    <CameraRig />
  </>
}

export default function World({ state, quality }: WorldProps) {
  const shadows = quality !== 'low'
  return <Canvas
    orthographic
    dpr={quality === 'high' ? [1, 1.75] : quality === 'medium' ? [1, 1.25] : 1}
    shadows={shadows}
    gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping }}
    camera={{ position: [29, 20, 32], zoom: quality === 'high' ? 39 : 35, near: 0.1, far: 100 }}
    style={{ width: '100%', height: '100%', display: 'block' }}
  >
    <WorldScene state={state} quality={quality} />
  </Canvas>
}
