/**
 * Build the small original RISE 966 character template used by the browser.
 *
 * Run with: npx tsx scripts/generate-assets.ts
 * The exporter intentionally uses only procedural Three.js geometry, so the
 * resulting GLB has no network or texture dependencies.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

type Reader = {
  result: ArrayBuffer | string | null
  onload: ((event: { target: { result: ArrayBuffer | string | null } }) => void) | null
  onloadend: (() => void) | null
  onerror: ((error: unknown) => void) | null
  readAsArrayBuffer: (blob: Blob) => void
  readAsDataURL: (blob: Blob) => void
}
const nodeGlobals = globalThis as typeof globalThis & { FileReader?: new () => Reader }
if (!nodeGlobals.FileReader) {
  nodeGlobals.FileReader = class FileReaderPolyfill {
    result: Reader['result'] = null
    onload: Reader['onload'] = null
    onloadend: Reader['onloadend'] = null
    onerror: Reader['onerror'] = null
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((bytes) => {
        this.result = bytes
        this.onload?.({ target: { result: this.result } })
        this.onloadend?.()
      }).catch((error) => this.onerror?.(error))
    }
    readAsDataURL(blob: Blob) {
      blob.arrayBuffer().then((bytes) => {
        const data = Buffer.from(bytes).toString('base64')
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${data}`
        this.onload?.({ target: { result: this.result } })
        this.onloadend?.()
      }).catch((error) => this.onerror?.(error))
    }
  } as unknown as new () => Reader
}

const material = (name: string, color: string, roughness = 0.62) => {
  const next = new THREE.MeshStandardMaterial({ color, roughness })
  next.name = name
  return next
}
const capsule = (name: string, color: string, radius: number, length: number) => {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 5, 8), material(name, color))
  mesh.name = name
  return mesh
}

function createAvatar() {
  const root = new THREE.Group()
  root.name = 'chr_rise966_template'
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.28, 5, 8), material('shirt', '#3f6d75'))
  torso.name = 'torso'
  torso.position.y = 0.38
  root.add(torso)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 9), material('skin', '#a96f4e', 0.75))
  head.name = 'head'
  head.position.y = 0.72
  root.add(head)
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), material('scarf', '#1b2028'))
  hair.name = 'hair'
  hair.position.y = 0.84
  root.add(hair)

  const parts: Array<[string, THREE.Vector3, THREE.Mesh]> = [
    ['leftArm', new THREE.Vector3(-0.2, 0.49, 0), capsule('leftArmMesh', '#3f6d75', 0.05, 0.2)],
    ['rightArm', new THREE.Vector3(0.2, 0.49, 0), capsule('rightArmMesh', '#3f6d75', 0.05, 0.2)],
    ['leftLeg', new THREE.Vector3(-0.09, 0.13, 0), capsule('pants', '#1d3240', 0.06, 0.18)],
    ['rightLeg', new THREE.Vector3(0.09, 0.13, 0), capsule('pants', '#1d3240', 0.06, 0.18)],
  ]
  for (const [name, position, mesh] of parts) {
    const group = new THREE.Group()
    group.name = name
    group.position.copy(position)
    mesh.position.y = name.endsWith('Arm') ? -0.13 : 0.08
    group.add(mesh)
    root.add(group)
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.018), material('accent', '#5df2df'))
  belt.name = 'accentBelt'
  belt.position.set(0, 0.2, 0.14)
  root.add(belt)
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: '#161b24' })
  for (const x of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMaterial)
    eye.name = x < 0 ? 'leftEye' : 'rightEye'
    eye.position.set(x, 0.72, 0.14)
    root.add(eye)
  }
  return root
}

const scalarTrack = (path: string, times: number[], values: number[]) => new THREE.NumberKeyframeTrack(path, times, values)
const quaternionTrack = (path: string, times: number[], angles: number[]) => {
  const values: number[] = []
  angles.forEach((angle) => new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0)).toArray(values, values.length))
  return new THREE.QuaternionKeyframeTrack(path, times, values)
}

function clips() {
  const idle = new THREE.AnimationClip('idle', 2, [
    quaternionTrack('leftArm.quaternion', [0, 1, 2], [0.03, -0.03, 0.03]),
    quaternionTrack('rightArm.quaternion', [0, 1, 2], [-0.03, 0.03, -0.03]),
  ])
  const run = new THREE.AnimationClip('run', 0.6, [
    quaternionTrack('leftArm.quaternion', [0, 0.3, 0.6], [0.72, -0.72, 0.72]),
    quaternionTrack('rightArm.quaternion', [0, 0.3, 0.6], [-0.72, 0.72, -0.72]),
    quaternionTrack('leftLeg.quaternion', [0, 0.3, 0.6], [-0.65, 0.65, -0.65]),
    quaternionTrack('rightLeg.quaternion', [0, 0.3, 0.6], [0.65, -0.65, 0.65]),
  ])
  const jump = new THREE.AnimationClip('jump', 1.1, [
    scalarTrack('.position[y]', [0, 0.3, 0.65, 1.1], [0, 0.34, 0.34, 0]),
    quaternionTrack('leftArm.quaternion', [0, 0.3, 0.65, 1.1], [0.2, -1, -1, 0]),
    quaternionTrack('rightArm.quaternion', [0, 0.3, 0.65, 1.1], [-0.2, 1, 1, 0]),
  ])
  const celebrate = new THREE.AnimationClip('celebrate', 1.8, [
    quaternionTrack('leftArm.quaternion', [0, 0.45, 0.9, 1.35, 1.8], [0, -1.8, -1.1, -1.8, 0]),
    quaternionTrack('rightArm.quaternion', [0, 0.45, 0.9, 1.35, 1.8], [0, 1.8, 1.1, 1.8, 0]),
  ])
  return [idle, run, jump, celebrate]
}

async function main() {
  const avatar = createAvatar()
  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(avatar, { binary: true, animations: clips(), includeCustomExtensions: false })
  const output = resolve(process.cwd(), 'public/models/chr-rise966.glb')
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, Buffer.from(result as ArrayBuffer))
  console.log(`Wrote ${output}`)
}

await main()
