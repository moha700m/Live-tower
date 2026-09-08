/** Visual tokens for the five LIVE TOWER worlds. Names stay stable for HUD/tests. */

export type Quality = 'high' | 'medium' | 'low'

export type WorldTheme = {
  id: number
  name: string
  ar: string
  tag: string
  skyZenith: string
  skyHorizon: string
  skyNadir: string
  fog: string
  fogNear: number
  fogFar: number
  stone: string
  stoneLight: string
  stoneDark: string
  metal: string
  lattice: string
  accent: string
  accentSoft: string
  glow: string
  gold: string
  ground: string
  key: string
  fill: string
  rim: string
  ambient: string
  particle: string
  haze: number
  kind: 'city' | 'najdi' | 'canyon' | 'sky' | 'royal'
}

export const TOWER_BASE = -11.25
export const TOWER_HEIGHT = 24.8
export const ROUTE_RADIUS = 2.58
export const ROUTE_TURNS = 9.05
export const CORE_RADIUS = 0.42
export const SHAFT_RADIUS = 1.34

export const WORLDS: WorldTheme[] = [
  {
    id: 0,
    name: 'RIYADH NIGHT',
    ar: 'ليالي الرياض',
    tag: 'nexus',
    skyZenith: '#06101c',
    skyHorizon: '#16324a',
    skyNadir: '#070b12',
    fog: '#0c1a28',
    fogNear: 28,
    fogFar: 92,
    stone: '#2a3538',
    stoneLight: '#c4a07a',
    stoneDark: '#161d22',
    metal: '#6f8b8e',
    lattice: '#1a2428',
    accent: '#3ee6d4',
    accentSoft: '#1a8f86',
    glow: '#6ffff0',
    gold: '#e8c37a',
    ground: '#0a1218',
    key: '#ffd7a8',
    fill: '#7ec8d8',
    rim: '#3ee6d4',
    ambient: '#8fb0c0',
    particle: '#8ef0e4',
    haze: 0.22,
    kind: 'city',
  },
  {
    id: 1,
    name: 'DIRIYAH',
    ar: 'الدرعية',
    tag: 'najdi',
    skyZenith: '#1a1210',
    skyHorizon: '#5a3a28',
    skyNadir: '#120c0a',
    fog: '#2a1a14',
    fogNear: 26,
    fogFar: 88,
    stone: '#8b5a38',
    stoneLight: '#d4a06a',
    stoneDark: '#3a2218',
    metal: '#c4a078',
    lattice: '#4a2c1c',
    accent: '#f0b060',
    accentSoft: '#c47838',
    glow: '#ffc878',
    gold: '#f0c878',
    ground: '#241610',
    key: '#ffc898',
    fill: '#e09860',
    rim: '#ffd090',
    ambient: '#d4b090',
    particle: '#ffd8a0',
    haze: 0.28,
    kind: 'najdi',
  },
  {
    id: 2,
    name: 'ALULA',
    ar: 'العُلا',
    tag: 'canyon',
    skyZenith: '#1c1420',
    skyHorizon: '#6a4030',
    skyNadir: '#140e12',
    fog: '#3a241c',
    fogNear: 24,
    fogFar: 80,
    stone: '#7a4a38',
    stoneLight: '#c88860',
    stoneDark: '#3a2018',
    metal: '#e0b070',
    lattice: '#4a281c',
    accent: '#ffc878',
    accentSoft: '#d47848',
    glow: '#ffd090',
    gold: '#ffc070',
    ground: '#2a1814',
    key: '#ffb070',
    fill: '#f0a060',
    rim: '#ffd8a0',
    ambient: '#c09070',
    particle: '#ffd8a8',
    haze: 0.34,
    kind: 'canyon',
  },
  {
    id: 3,
    name: 'SKY OASIS',
    ar: 'واحة السماء',
    tag: 'citadel',
    skyZenith: '#8ec8e0',
    skyHorizon: '#d8f0f0',
    skyNadir: '#3a6a80',
    fog: '#b8dce8',
    fogNear: 36,
    fogFar: 110,
    stone: '#d8e8e4',
    stoneLight: '#f4fff8',
    stoneDark: '#7aa0a8',
    metal: '#c8f0f0',
    lattice: '#90b8b8',
    accent: '#40d8ff',
    accentSoft: '#38a8b0',
    glow: '#b8ffff',
    gold: '#ffe8a8',
    ground: '#d0e8e8',
    key: '#fff6e0',
    fill: '#a8e0f0',
    rim: '#70f0ff',
    ambient: '#e8f4f8',
    particle: '#ffffff',
    haze: 0.16,
    kind: 'sky',
  },
  {
    id: 4,
    name: 'FUTURE 966',
    ar: 'المستقبل 966',
    tag: 'royal',
    skyZenith: '#0a0c14',
    skyHorizon: '#1a2438',
    skyNadir: '#08060e',
    fog: '#10141c',
    fogNear: 30,
    fogFar: 96,
    stone: '#1c1a22',
    stoneLight: '#d8c6a0',
    stoneDark: '#0e0c14',
    metal: '#c8b080',
    lattice: '#16141c',
    accent: '#3ec8a8',
    accentSoft: '#1a6a58',
    glow: '#7af0c8',
    gold: '#e8c878',
    ground: '#0c0a12',
    key: '#ffe0b0',
    fill: '#70c8b0',
    rim: '#e8c878',
    ambient: '#a09080',
    particle: '#e8d090',
    haze: 0.2,
    kind: 'royal',
  },
]

export const HUD_ACCENTS = WORLDS.map((w) => w.accent)

export function worldTheme(index: number): WorldTheme {
  const i = Math.abs(Number(index) || 0) % WORLDS.length
  return WORLDS[i]
}

export const appearanceStyles = [
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

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export function routePoint(progress: number, offset = 0) {
  const p = clamp(progress, 0, 1)
  const angle = p * Math.PI * ROUTE_TURNS + offset
  return {
    x: Math.cos(angle) * ROUTE_RADIUS,
    y: TOWER_BASE + p * TOWER_HEIGHT,
    z: Math.sin(angle) * ROUTE_RADIUS,
    angle,
    p,
  }
}
