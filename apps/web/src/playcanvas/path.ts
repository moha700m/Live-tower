export const TOWER_HEIGHT = 64;
export const TOWER_BASE = 1.9;
export const RACER_HEIGHT = 1.85;
export const BROADCAST_YAW = Math.atan2(16.2, 11.2);

export const LEVELS = [
  { id: "start", label: "START ARENA", from: 0, to: 0.1, radius: 7.2 },
  { id: "ascent", label: "ASCENT", from: 0.1, to: 0.24, radius: 6.4 },
  { id: "gate", label: "BOOST GATE", from: 0.24, to: 0.38, radius: 5.6 },
  { id: "obstacle", label: "MOVING OBSTACLE", from: 0.38, to: 0.54, radius: 5.4 },
  { id: "shortcut", label: "RISK SHORTCUT", from: 0.54, to: 0.7, radius: 6.2 },
  { id: "final", label: "FINAL ASCENT", from: 0.7, to: 0.88, radius: 4.6 },
  { id: "summit", label: "CROWN", from: 0.88, to: 1, radius: 3.6 },
] as const;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function radiusAt(progress: number): number {
  const p = clamp01(progress);
  for (let i = 0; i < LEVELS.length; i += 1) {
    const level = LEVELS[i]!;
    const next = LEVELS[i + 1];
    if (p >= level.from && p <= level.to) {
      if (!next) return level.radius;
      const mix = smoothstep(level.from, level.to, p);
      return level.radius + (next.radius - level.radius) * mix;
    }
  }
  return LEVELS[LEVELS.length - 1]!.radius;
}

export function heightAt(progress: number): number {
  return TOWER_BASE + clamp01(progress) * TOWER_HEIGHT;
}

export function laneAngle(lane: number, progress: number, time = 0): number {
  const spread = Math.PI * 0.52;
  const base = BROADCAST_YAW - spread / 2;
  const slot = base + (lane / 7) * spread;
  const drift = Math.sin(progress * 8.4 + lane * 1.55) * 0.05;
  return slot + drift + progress * 0.18 + time * 0.008;
}

export interface PathPoint {
  x: number;
  y: number;
  z: number;
  angle: number;
  radius: number;
}

export function pathPoint(progress: number, lane: number, time = 0): PathPoint {
  const p = clamp01(progress);
  const radius = radiusAt(p);
  const angle = laneAngle(lane, p, time);
  return {
    x: Math.cos(angle) * radius,
    y: heightAt(p),
    z: Math.sin(angle) * radius,
    angle,
    radius,
  };
}

export const PODIUM_SLOTS = [
  { x: 0, y: heightAt(1) + 1.35, z: 1.05 },
  { x: -1.7, y: heightAt(1) + 0.85, z: 0.7 },
  { x: 1.7, y: heightAt(1) + 0.62, z: 0.7 },
] as const;
