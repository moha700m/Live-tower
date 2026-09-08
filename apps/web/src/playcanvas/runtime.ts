import {
  Application,
  BLEND_ADDITIVE,
  BLEND_NORMAL,
  Color,
  Entity,
  FILLMODE_NONE,
  FOG_LINEAR,
  LIGHTFALLOFF_INVERSESQUARED,
  MeshInstance,
  RESOLUTION_AUTO,
  StandardMaterial,
  Vec3,
  createTorus,
} from "playcanvas";
import type { GameSnapshot, PlayerSnapshot } from "../../../packages/contracts/index.ts";
import { RACER_LOOKS, RIYADH, hex } from "./palette";
import { LEVELS, PODIUM_SLOTS, TOWER_BASE, TOWER_HEIGHT, heightAt, pathPoint } from "./path";

export interface Nameplate {
  id: string;
  name: string;
  x: number;
  y: number;
  progress: number;
  leader: boolean;
  boosting: boolean;
  finishOrder?: number;
}

export interface LiveTowerRuntime {
  setSnapshot: (snapshot: GameSnapshot) => void;
  getNameplates: () => Nameplate[];
  destroy: () => void;
  resize: () => void;
}

const tmpScreen = new Vec3();
const tmpWorld = new Vec3();

function mat(opts: {
  diffuse: Color;
  emissive?: Color;
  emissiveIntensity?: number;
  metalness?: number;
  gloss?: number;
  opacity?: number;
  unlit?: boolean;
  additive?: boolean;
}): StandardMaterial {
  const material = new StandardMaterial();
  material.useMetalness = true;
  material.diffuse = opts.diffuse.clone();
  material.emissive = (opts.emissive ?? hex("#000000")).clone();
  material.emissiveIntensity = opts.emissiveIntensity ?? 0;
  material.metalness = opts.metalness ?? 0.08;
  material.gloss = opts.gloss ?? 0.32;
  material.useLighting = opts.unlit ? false : true;
  if (opts.opacity !== undefined && opts.opacity < 1) {
    material.opacity = opts.opacity;
    material.blendType = opts.additive ? BLEND_ADDITIVE : BLEND_NORMAL;
    material.depthWrite = false;
  } else if (opts.additive) {
    material.blendType = BLEND_ADDITIVE;
    material.depthWrite = false;
    material.opacity = opts.opacity ?? 1;
  }
  material.update();
  return material;
}

function lookHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % RACER_LOOKS.length;
}

function expLerp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function prim(
  name: string,
  type: "box" | "sphere" | "cylinder" | "cone" | "capsule" | "plane",
  material: StandardMaterial,
  parent: Entity,
  pos: [number, number, number],
  scale: [number, number, number],
  euler: [number, number, number] = [0, 0, 0],
): Entity {
  const entity = new Entity(name);
  entity.addComponent("render", { type, material, castShadows: false, receiveShadows: false });
  if (entity.render?.meshInstances) {
    for (const mi of entity.render.meshInstances) mi.cull = false;
  }
  entity.setLocalPosition(pos[0], pos[1], pos[2]);
  entity.setLocalScale(scale[0], scale[1], scale[2]);
  entity.setLocalEulerAngles(euler[0], euler[1], euler[2]);
  parent.addChild(entity);
  return entity;
}

function cyl(
  name: string,
  material: StandardMaterial,
  parent: Entity,
  pos: [number, number, number],
  radius: number,
  height: number,
  euler: [number, number, number] = [0, 0, 0],
): Entity {
  return prim(name, "cylinder", material, parent, pos, [radius * 2, height, radius * 2], euler);
}

function torus(
  app: Application,
  name: string,
  material: StandardMaterial,
  parent: Entity,
  ringRadius: number,
  tubeRadius: number,
  pos: [number, number, number],
  euler: [number, number, number] = [0, 0, 0],
  segments = 28,
  sides = 10,
): Entity {
  const mesh = createTorus(app.graphicsDevice, { ringRadius, tubeRadius, segments, sides });
  const instance = new MeshInstance(mesh, material);
  const entity = new Entity(name);
  entity.addComponent("render", { meshInstances: [instance], castShadows: false, receiveShadows: false });
  entity.setLocalPosition(pos[0], pos[1], pos[2]);
  entity.setLocalEulerAngles(euler[0], euler[1], euler[2]);
  parent.addChild(entity);
  return entity;
}

interface Particle {
  entity: Entity;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vz: number;
  active: boolean;
}

interface RacerView {
  id: string;
  root: Entity;
  glow: Entity;
  trail: Entity[];
  lane: number;
  visualP: number;
  hop: number;
  squash: number;
}

const EMPTY: GameSnapshot = {
  phase: "WAITING",
  round: 1,
  worldIndex: 0,
  phaseEndsAt: null,
  serverNow: 0,
  nowMs: 0,
  players: [],
  queue: [],
  feed: [],
  progress: {},
  likes: 0,
  hype: 0,
  eventName: "Live Tower",
  revision: 0,
};

export function createLiveTowerRuntime(canvas: HTMLCanvasElement, initial?: GameSnapshot): LiveTowerRuntime {
  const app = new Application(canvas, {
    graphicsDeviceOptions: {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: true,
    },
  });
  app.setCanvasFillMode(FILLMODE_NONE);
  app.setCanvasResolution(RESOLUTION_AUTO);
  app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  app.scene.ambientLight = new Color(0.32, 0.3, 0.28);
  app.scene.fog.type = FOG_LINEAR;
  app.scene.fog.color = RIYADH.fog;
  app.scene.fog.start = 36;
  app.scene.fog.end = 130;

  const stone = mat({ diffuse: RIYADH.stone, metalness: 0.04, gloss: 0.22 });
  const stoneLite = mat({ diffuse: RIYADH.stoneLight, metalness: 0.05, gloss: 0.28 });
  const sand = mat({ diffuse: RIYADH.sand, metalness: 0.04, gloss: 0.1 });
  const gold = mat({
    diffuse: RIYADH.gold,
    emissive: RIYADH.gold,
    emissiveIntensity: 0.62,
    metalness: 0.7,
    gloss: 0.8,
  });
  const goldHot = mat({
    diffuse: RIYADH.goldHot,
    emissive: RIYADH.goldHot,
    emissiveIntensity: 1.5,
    metalness: 0.3,
    gloss: 0.62,
    unlit: true,
  });
  const tealGlow = mat({
    diffuse: RIYADH.teal,
    emissive: RIYADH.cyan,
    emissiveIntensity: 1.15,
    unlit: true,
  });
  const goldAdd = mat({
    diffuse: hex("#000000"),
    emissive: RIYADH.goldHot,
    emissiveIntensity: 1.85,
    additive: true,
    opacity: 0.3,
    unlit: true,
  });
  const windowMat = mat({
    diffuse: RIYADH.window,
    emissive: RIYADH.window,
    emissiveIntensity: 1.45,
    unlit: true,
  });
  const particleMat = mat({
    diffuse: RIYADH.goldHot,
    emissive: RIYADH.goldHot,
    emissiveIntensity: 2,
    unlit: true,
    additive: true,
    opacity: 0.9,
  });
  const moonMat = mat({
    diffuse: hex("#E8D8B9"),
    emissive: hex("#E8D8B9"),
    emissiveIntensity: 0.7,
    unlit: true,
  });

  const world = new Entity("RiyadhNight");
  app.root.addChild(world);
  const environment = new Entity("Environment");
  const tower = new Entity("Tower");
  const fxRoot = new Entity("FX");
  world.addChild(environment);
  world.addChild(tower);
  world.addChild(fxRoot);

  cyl("Ground", sand, environment, [0, -0.35, 0], 48, 0.5);
  cyl("Plaza", stone, environment, [0, 0.12, 0], 13.5, 0.28);
  torus(app, "PlazaRing", gold, environment, 12.2, 0.1, [0, 0.32, 0], [0, 0, 0], 48, 8);
  torus(app, "PlazaInner", tealGlow, environment, 10.4, 0.05, [0, 0.34, 0], [0, 0, 0], 40, 6);

  for (let i = 0; i < 22; i += 1) {
    const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.08;
    const dist = 28 + (i % 5) * 3.6;
    const h = 7 + ((i * 19) % 16);
    const w = 1.6 + (i % 4) * 0.55;
    const d = 1.4 + (i % 3) * 0.45;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    prim(`Bldg_${i}`, "box", i % 2 ? stone : stoneLite, environment, [x, h / 2, z], [w, h, d], [0, (angle * 180) / Math.PI, 0]);
    prim(
      `Win_${i}`,
      "box",
      windowMat,
      environment,
      [x + Math.cos(angle) * (w * 0.52), h * 0.58, z + Math.sin(angle) * (d * 0.52)],
      [0.1, h * 0.22, w * 0.38],
      [0, (angle * 180) / Math.PI, 0],
    );
    if (i % 3 === 0) {
      prim(`Crown_${i}`, "cone", gold, environment, [x, h + 0.7, z], [0.7, 1.3, 0.7]);
    }
  }

  prim("Moon", "sphere", moonMat, environment, [-28, 48, -42], [3.4, 3.4, 3.4]);

  const bands = 11;
  for (let i = 0; i < bands; i += 1) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const y0 = heightAt(t0) - 0.2;
    const y1 = heightAt(t1) + 0.2;
    const radius = 2.55 - t0 * 1.15;
    cyl(`Core_${i}`, i % 2 ? stoneLite : stone, tower, [0, (y0 + y1) / 2, 0], radius, Math.max(0.6, y1 - y0));
    if (i % 2 === 0) {
      for (let w = 0; w < 6; w += 1) {
        const a = (w / 6) * Math.PI * 2 + i * 0.12;
        prim(
          `CoreWin_${i}_${w}`,
          "box",
          windowMat,
          tower,
          [Math.cos(a) * radius, (y0 + y1) / 2, Math.sin(a) * radius],
          [0.12, (y1 - y0) * 0.42, 0.42],
        );
      }
    }
  }

  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    prim(
      `Pier_${i}`,
      "box",
      gold,
      tower,
      [Math.cos(a) * 2.05, TOWER_BASE + TOWER_HEIGHT / 2, Math.sin(a) * 2.05],
      [0.22, TOWER_HEIGHT + 1.6, 0.22],
    );
  }

  const progressSpine = cyl("ProgressSpine", goldHot, tower, [0, TOWER_BASE, 0], 0.55, 0.4);
  const rotatingBars: Entity[] = [];
  const pulseRings: Entity[] = [];
  const lightShafts: Entity[] = [];

  const PLATES = 12;
  for (let i = 0; i < PLATES; i += 1) {
    const p = i / (PLATES - 1);
    const y = heightAt(p);
    const radius = 8.2 - p * 4.6;
    cyl(`Plate_${i}`, i % 2 ? stone : stoneLite, tower, [0, y, 0], radius, i === 0 ? 0.42 : 0.26);
    torus(app, `PlateEdge_${i}`, gold, tower, radius - 0.05, 0.07, [0, y + 0.16, 0], [0, 0, 0], 36, 8);
  }

  LEVELS.forEach((level, index) => {
    const y = heightAt(level.from);
    const group = new Entity(`Level_${level.id}`);
    tower.addChild(group);
    if (level.id === "start") {
      for (let pad = 0; pad < 8; pad += 1) {
        const a = (pad / 8) * Math.PI * 2;
        cyl(`Pad_${pad}`, gold, group, [Math.cos(a) * 6.3, y + 0.28, Math.sin(a) * 6.3], 0.62, 0.16);
      }
      const gate = torus(app, "StartGate", tealGlow, group, 3.8, 0.12, [0, y + 2.8, 0], [90, 0, 0], 32, 8);
      pulseRings.push(gate);
      for (let a = 0; a < 4; a += 1) {
        const ang = (a / 4) * Math.PI * 2;
        prim(
          `Arch_${a}`,
          "box",
          gold,
          group,
          [Math.cos(ang) * 9.0, y + 1.6, Math.sin(ang) * 9.0],
          [0.22, 3.2, 0.22],
        );
      }
    }
    if (level.id === "ascent") {
      for (let step = 0; step < 4; step += 1) {
        const sy = y + step * 2.15;
        cyl(`Ascent_${step}`, stoneLite, group, [0, sy, 0], 7.2 - step * 0.35, 0.18);
      }
    }
    if (level.id === "gate") {
      pulseRings.push(torus(app, "BoostRingA", goldHot, group, 3.2, 0.14, [0, y + 1.4, 0], [90, 0, 0], 36, 10));
      pulseRings.push(torus(app, "BoostRingB", tealGlow, group, 2.5, 0.1, [0, y + 3.1, 0], [90, 18, 0], 32, 8));
      cyl("GateDeck", stone, group, [0, y, 0], level.radius + 0.6, 0.3);
    }
    if (level.id === "obstacle") {
      const spinner = new Entity("Spinner");
      spinner.setLocalPosition(0, y + 1.7, 0);
      group.addChild(spinner);
      prim("BarA", "box", goldHot, spinner, [0, 0, 0], [11.2, 0.28, 0.28]);
      prim("BarB", "box", tealGlow, spinner, [0, 0, 0], [0.28, 0.28, 11.2]);
      prim("Hub", "sphere", gold, spinner, [0, 0, 0], [0.7, 0.7, 0.7]);
      rotatingBars.push(spinner);
    }
    if (level.id === "shortcut") {
      torus(app, "OuterLane", tealGlow, group, 8.0, 0.1, [0, y + 0.35, 0], [0, 0, 0], 40, 8);
      torus(app, "InnerLane", gold, group, 4.6, 0.1, [0, y + 0.35, 0], [0, 0, 0], 32, 8);
    }
    if (level.id === "final") {
      for (let c = 0; c < 6; c += 1) {
        const a = (c / 6) * Math.PI * 2;
        lightShafts.push(
          prim(
            `Shaft_${c}`,
            "cone",
            goldAdd,
            group,
            [Math.cos(a) * 2.8, y + 5.2, Math.sin(a) * 2.8],
            [1.05, 10.5, 1.05],
            [180, 0, 0],
          ),
        );
      }
    }
    if (level.id === "summit") {
      cyl("CrownDeck", stoneLite, group, [0, heightAt(1) + 0.2, 0], 5.2, 0.5);
      torus(app, "CrownRing", goldHot, group, 3.4, 0.12, [0, heightAt(1) + 0.55, 0], [0, 0, 0], 40, 8);
      prim("CrownJewel", "cone", gold, group, [0, heightAt(1) + 2.15, 0], [1.7, 2.3, 1.7]);
      prim("CrownCap", "sphere", goldHot, group, [0, heightAt(1) + 3.35, 0], [0.5, 0.5, 0.5]);
      PODIUM_SLOTS.forEach((slot, i) => {
        const h = i === 0 ? 1.2 : i === 1 ? 0.84 : 0.62;
        cyl(`Plinth_${i}`, i === 0 ? gold : stoneLite, group, [slot.x, slot.y - 0.35, slot.z], 0.62, h);
      });
      lightShafts.push(cyl("SummitBeam", goldAdd, group, [0, heightAt(1) + 11, 0], 1.35, 20));
    }
    void index;
  });

  const moon = new Entity("KeyMoon");
  moon.addComponent("light", {
    type: "directional",
    color: new Color(0.62, 0.72, 0.88),
    intensity: 0.62,
    castShadows: false,
  });
  moon.setEulerAngles(18, 42, 0);
  app.root.addChild(moon);
  const warm = new Entity("WarmFill");
  warm.addComponent("light", {
    type: "directional",
    color: new Color(1, 0.84, 0.58),
    intensity: 0.58,
    castShadows: false,
  });
  warm.setEulerAngles(36, -128, 0);
  app.root.addChild(warm);
  const rim = new Entity("RimGold");
  rim.addComponent("light", {
    type: "directional",
    color: RIYADH.goldHot,
    intensity: 0.35,
    castShadows: false,
  });
  rim.setEulerAngles(-12, 180, 0);
  app.root.addChild(rim);
  const summitLight = new Entity("SummitLight");
  summitLight.addComponent("light", {
    type: "omni",
    color: RIYADH.goldHot,
    intensity: 4.2,
    range: 42,
    falloffMode: LIGHTFALLOFF_INVERSESQUARED,
  });
  summitLight.setPosition(0, heightAt(1) + 4, 0);
  app.root.addChild(summitLight);
  const packLight = new Entity("PackLight");
  packLight.addComponent("light", {
    type: "omni",
    color: RIYADH.gold,
    intensity: 3.4,
    range: 22,
  });
  packLight.setPosition(0, 8, 8);
  app.root.addChild(packLight);

  const camera = new Entity("BroadcastCamera");
  camera.addComponent("camera", {
    clearColor: RIYADH.sky,
    fov: 56,
    nearClip: 0.2,
    farClip: 260,
  });
  camera.setPosition(11.2, 7.4, 16.2);
  app.root.addChild(camera);

  const particles: Particle[] = [];
  for (let i = 0; i < 48; i += 1) {
    const entity = prim(`P_${i}`, "sphere", particleMat, fxRoot, [0, -80, 0], [0.12, 0.12, 0.12]);
    entity.enabled = false;
    particles.push({ entity, life: 0, max: 1, vx: 0, vy: 0, vz: 0, active: false });
  }

  const spawnBurst = (x: number, y: number, z: number, count: number, power: number) => {
    let spawned = 0;
    for (const particle of particles) {
      if (particle.active) continue;
      particle.active = true;
      particle.life = 0;
      particle.max = 0.32 + Math.random() * 0.4;
      particle.vx = (Math.random() - 0.5) * power;
      particle.vy = Math.random() * power * 0.95 + 0.5;
      particle.vz = (Math.random() - 0.5) * power;
      particle.entity.enabled = true;
      particle.entity.setPosition(x, y + 0.5, z);
      const s = 0.14 + Math.random() * 0.12;
      particle.entity.setLocalScale(s, s, s);
      spawned += 1;
      if (spawned >= count) break;
    }
  };

  const racerViews = new Map<string, RacerView>();
  const racerMats = RACER_LOOKS.map((look) => ({
    body: mat({
      diffuse: look.body,
      emissive: look.body,
      emissiveIntensity: 0.45,
      metalness: 0,
      gloss: 0.38,
    }),
    accent: mat({
      diffuse: look.accent,
      emissive: look.accent,
      emissiveIntensity: 0.55,
      metalness: 0,
      gloss: 0.5,
    }),
    scarf: mat({
      diffuse: look.scarf,
      emissive: look.scarf,
      emissiveIntensity: 0.35,
      metalness: 0,
      gloss: 0.42,
    }),
    skin: mat({
      diffuse: look.skin,
      emissive: look.skin,
      emissiveIntensity: 0.2,
      metalness: 0,
      gloss: 0.28,
    }),
  }));

  const makeRacer = (id: string, lane: number): RacerView => {
    const look = racerMats[lookHash(id)]!;
    const root = new Entity(`Racer_${id}`);
    app.root.addChild(root);
    prim("LegL", "cylinder", look.body, root, [-0.22, 0.4, 0], [0.32, 0.8, 0.32]);
    prim("LegR", "cylinder", look.body, root, [0.22, 0.4, 0], [0.32, 0.8, 0.32]);
    prim("Body", "cylinder", look.body, root, [0, 1.12, 0], [0.86, 1.22, 0.64]);
    prim("ShoulderL", "sphere", look.accent, root, [-0.52, 1.46, 0], [0.3, 0.26, 0.3]);
    prim("ShoulderR", "sphere", look.accent, root, [0.52, 1.46, 0], [0.3, 0.26, 0.3]);
    prim("Head", "sphere", look.skin, root, [0, 1.92, 0], [0.56, 0.56, 0.56]);
    torus(app, "Scarf", look.scarf, root, 0.28, 0.06, [0, 1.54, 0.04], [10, 0, 0], 16, 8);
    prim("Badge", "box", look.accent, root, [0, 1.18, 0.28], [0.22, 0.32, 0.07]);
    const glow = torus(app, "BoostGlow", goldAdd, root, 0.46, 0.06, [0, 0.14, 0], [0, 0, 0], 16, 6);
    glow.enabled = false;
    const trail: Entity[] = [];
    for (let t = 0; t < 4; t += 1) {
      const disc = torus(app, `Trail_${t}`, goldAdd, fxRoot, 0.26, 0.035, [0, -40, 0], [90, 0, 0], 10, 6);
      disc.enabled = false;
      trail.push(disc);
    }
    return { id, root, glow, trail, lane, visualP: 0, hop: 0, squash: 1 };
  };

  let snapshot: GameSnapshot = initial ?? EMPTY;
  const cam = {
    x: 11.2,
    y: 7.4,
    z: 16.2,
    lx: 0,
    ly: 8.0,
    lz: 0,
    fov: 56,
    trauma: 0,
    heroUntil: 0,
    heroId: "",
    mode: "pack" as "pack" | "hero" | "summit" | "podium",
  };
  const prevBoost = new Map<string, number>();
  const prevProgress = new Map<string, number>();
  let usedLanes = 0;
  const laneOf = new Map<string, number>();

  const assignLane = (id: string): number => {
    const existing = laneOf.get(id);
    if (existing !== undefined) return existing;
    const lane = usedLanes % 8;
    usedLanes += 1;
    laneOf.set(id, lane);
    return lane;
  };

  const resize = () => {
    const parent = canvas.parentElement;
    const width = Math.max(1, parent?.clientWidth || canvas.clientWidth || 390);
    const height = Math.max(1, parent?.clientHeight || canvas.clientHeight || 844);
    app.resizeCanvas(width, height);
  };

  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas.parentElement ?? canvas);

  const pickVisible = (players: PlayerSnapshot[]): PlayerSnapshot[] => {
    if (players.length <= 8) return players;
    const boosting = players.filter((p) => (p.boostUntil ?? 0) > snapshot.serverNow);
    const ranked = [...players].sort((a, b) => b.progress - a.progress);
    const chosen = new Map<string, PlayerSnapshot>();
    for (const p of boosting) chosen.set(p.id, p);
    for (const p of ranked) {
      if (chosen.size >= 8) break;
      chosen.set(p.id, p);
    }
    return [...chosen.values()];
  };

  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  app.on("update", (dtRaw: number) => {
    const dt = Math.min(0.1, Math.max(0.001, dtRaw));
    const now = snapshot.serverNow || performance.now();
    const rush = snapshot.phase === "FINAL_RUSH";
    const podium = snapshot.phase === "PODIUM" || snapshot.phase === "TRANSITION";
    const t = performance.now() / 1000;
    const hype = Math.min(1, snapshot.likes / 1000);

    gold.emissiveIntensity = 0.55 + hype * 0.7 + (rush ? 0.85 : 0) + Math.sin(t * 3.2) * 0.08;
    gold.update();
    goldHot.emissiveIntensity = 1.3 + (rush ? 1.15 : 0) + hype * 0.55;
    goldHot.update();
    summitLight.light!.intensity = 3.6 + (rush ? 2.6 : 0) + hype * 1.5;
    camera.camera!.clearColor = rush ? hex("#140C08") : RIYADH.sky;
    app.scene.fog.end = rush ? 88 : 130;

    for (const bar of rotatingBars) bar.rotate(0, 55 * dt, 0);
    for (const ring of pulseRings) {
      const s = 1 + Math.sin(t * 3.6) * 0.045;
      ring.setLocalScale(s, s, s);
      ring.rotate(0, 32 * dt, 0);
    }
    for (const shaft of lightShafts) {
      const pulse = 0.92 + Math.sin(t * 2.2) * 0.08 + (rush ? 0.18 : 0);
      const scale = shaft.getLocalScale();
      shaft.setLocalScale(scale.x, scale.y, pulse);
    }

    for (const particle of particles) {
      if (!particle.active) continue;
      particle.life += dt;
      if (particle.life >= particle.max) {
        particle.active = false;
        particle.entity.enabled = false;
        continue;
      }
      const pos = particle.entity.getPosition();
      particle.entity.setPosition(pos.x + particle.vx * dt, pos.y + particle.vy * dt, pos.z + particle.vz * dt);
      particle.vy -= 2.6 * dt;
      const fade = 1 - particle.life / particle.max;
      const s = 0.07 + fade * 0.16;
      particle.entity.setLocalScale(s, s, s);
    }

    const visible = pickVisible(snapshot.players);
    const visibleIds = new Set(visible.map((p) => p.id));
    for (const [id, view] of racerViews) {
      if (!visibleIds.has(id) && !snapshot.players.some((p) => p.id === id)) {
        view.root.destroy();
        for (const disc of view.trail) disc.destroy();
        racerViews.delete(id);
      } else if (!visibleIds.has(id)) {
        view.root.enabled = false;
        for (const disc of view.trail) disc.enabled = false;
      }
    }

    let packY = TOWER_BASE;
    let packX = 0;
    let packZ = 0;
    let packCount = 0;
    let leaderY = TOWER_BASE;
    const leaderId = snapshot.leaderId;

    for (const player of visible) {
      const lane = assignLane(player.id);
      let view = racerViews.get(player.id);
      if (!view) {
        view = makeRacer(player.id, lane);
        racerViews.set(player.id, view);
        view.visualP = player.progress;
      }
      view.root.enabled = true;
      const boosting = (player.boostUntil ?? 0) > now;
      const prevB = prevBoost.get(player.id) ?? 0;
      const prevP = prevProgress.get(player.id) ?? player.progress;
      const jump = player.progress - prevP;
      if (boosting && prevB <= now) {
        const pt = pathPoint(view.visualP, view.lane, t);
        spawnBurst(pt.x, pt.y + 1.1, pt.z, jump > 0.12 ? 16 : 7, jump > 0.12 ? 5.5 : 2.8);
        view.hop = jump > 0.12 ? 1.7 : 0.65;
        cam.trauma = Math.min(1, cam.trauma + (jump > 0.12 ? 0.4 : 0.16));
        if (jump > 0.12) {
          cam.heroUntil = t + 1.45;
          cam.heroId = player.id;
          cam.mode = "hero";
        }
      }
      if (jump < -0.002) view.squash = 0.78;
      prevBoost.set(player.id, player.boostUntil ?? 0);
      prevProgress.set(player.id, player.progress);

      view.visualP = expLerp(view.visualP, player.progress, boosting ? 7.4 : 5.1, dt);
      view.hop = Math.max(0, view.hop - dt * 2.5);
      view.squash = expLerp(view.squash, 1, 10, dt);

      const finish = player.finishOrder;
      let x: number, y: number, z: number, angle: number;
      if (podium && finish && finish <= 3) {
        const slot = PODIUM_SLOTS[finish - 1]!;
        x = slot.x;
        y = slot.y;
        z = slot.z;
        angle = t * 0.35;
      } else {
        const pt = pathPoint(view.visualP, view.lane, t);
        x = pt.x;
        y = pt.y + view.hop + Math.sin(t * (boosting ? 13 : 8.5) + view.lane) * 0.06 + 0.12;
        z = pt.z;
        angle = pt.angle;
      }
      view.root.setPosition(x, y, z);
      view.root.setEulerAngles(0, (-angle * 180) / Math.PI + 90, boosting ? 8 : 0);
      const stretch = 1 + view.hop * 0.16;
      const size = 2.9;
      view.root.setLocalScale(view.squash * size, (stretch / Math.max(0.72, view.squash)) * size, view.squash * size);
      view.glow.enabled = boosting || finish === 1;
      if (boosting) {
        const g = 0.92 + Math.sin(t * 16) * 0.1;
        view.glow.setLocalScale(g, g, g);
        view.trail.forEach((disc, i) => {
          disc.enabled = true;
          const back = pathPoint(Math.max(0, view.visualP - (i + 1) * 0.014), view.lane, t);
          disc.setPosition(back.x, back.y + 0.55, back.z);
        });
      } else {
        for (const disc of view.trail) disc.enabled = false;
      }

      const weight = boosting || player.id === leaderId ? 2.4 : 1;
      packX += x * weight;
      packY += y * weight;
      packZ += z * weight;
      packCount += weight;
      if (player.id === leaderId) leaderY = y;
    }

    if (packCount > 0) {
      packX /= packCount;
      packY /= packCount;
      packZ /= packCount;
    } else {
      packY = TOWER_BASE + 0.4;
    }

    const spineH = Math.max(0.5, leaderY - TOWER_BASE + 1.2);
    progressSpine.setLocalScale(1.1, spineH, 1.1);
    progressSpine.setLocalPosition(0, TOWER_BASE + spineH / 2, 0);
    packLight.setPosition(packX * 0.35, packY + 3.2, packZ * 0.35 + 6);

    if (snapshot.phase === "PODIUM" || snapshot.phase === "TRANSITION") cam.mode = "podium";
    else if (snapshot.winnerId && snapshot.phase !== "ACTIVE" && snapshot.phase !== "FINAL_RUSH") cam.mode = "summit";
    else if (cam.heroUntil > t) cam.mode = "hero";
    else cam.mode = "pack";

    let focusX = packX * 0.15;
    let focusY = packY + 5.8;
    let focusZ = packZ * 0.15;
    let side = 11.2;
    let back = 16.2;
    let height = 5.2;
    let desiredFov = rush ? 52 : 56;
    if (cam.mode === "hero") {
      const hero = racerViews.get(cam.heroId);
      if (hero) {
        const hp = hero.root.getPosition();
        focusX = hp.x * 0.35;
        focusY = hp.y + 3.2;
        focusZ = hp.z * 0.35;
        height = 3.6;
      }
      side = 9.4;
      back = 13.4;
      desiredFov = 48;
    } else if (cam.mode === "summit" || cam.mode === "podium") {
      focusX = 0;
      focusY = heightAt(1) + 2.4;
      focusZ = 0;
      side = 8.8;
      back = 13.8;
      height = 5.2;
      desiredFov = 46;
    }
    if (cam.mode === "hero") {
      const hero = racerViews.get(cam.heroId);
      if (hero) {
        const hp = hero.root.getPosition();
        focusX = hp.x * 0.4;
        focusY = hp.y + 3.4;
        focusZ = hp.z * 0.4;
        height = 3.8;
      }
      side = 10.2;
      back = 14.2;
      desiredFov = 34;
    } else if (cam.mode === "summit" || cam.mode === "podium") {
      focusX = 0;
      focusY = heightAt(1) + 2.8;
      focusZ = 0;
      side = 9.2;
      back = 14.5;
      height = 5.4;
      desiredFov = 33;
    }

    const desiredX = focusX + side;
    const desiredY = (cam.mode === "summit" || cam.mode === "podium" ? heightAt(1) : packY) + height;
    const desiredZ = focusZ + back;
    cam.x = expLerp(cam.x, desiredX, 3.8, dt);
    cam.y = expLerp(cam.y, desiredY, 4.1, dt);
    cam.z = expLerp(cam.z, desiredZ, 3.8, dt);
    cam.lx = expLerp(cam.lx, focusX, 4.2, dt);
    cam.ly = expLerp(cam.ly, focusY, 4.2, dt);
    cam.lz = expLerp(cam.lz, focusZ, 4.2, dt);
    cam.fov = expLerp(cam.fov, desiredFov, 3.0, dt);
    cam.trauma = Math.max(0, cam.trauma - dt * 1.7);
    const shake = reducedMotion ? 0 : cam.trauma * cam.trauma;
    camera.setPosition(
      cam.x + Math.sin(t * 33) * shake * 0.14,
      cam.y + Math.cos(t * 27) * shake * 0.09,
      cam.z,
    );
    camera.lookAt(cam.lx, cam.ly, cam.lz);
    if (camera.camera) camera.camera.fov = cam.fov;
    (window as unknown as { __pc: unknown }).__pc = {
      mode: cam.mode,
      y: cam.y,
      z: cam.z,
      packY,
      phase: snapshot.phase,
      n: snapshot.players.length,
      views: racerViews.size,
      sample: (() => {
        const first = racerViews.values().next().value as RacerView | undefined;
        if (!first) return null;
        const p = first.root.getPosition();
        return { id: first.id, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), on: first.root.enabled };
      })(),
    };
  });

  for (const player of snapshot.players) {
    const lane = assignLane(player.id);
    const view = makeRacer(player.id, lane);
    view.visualP = player.progress;
    const pt = pathPoint(view.visualP, lane, 0);
    view.root.setPosition(pt.x, pt.y + 0.12, pt.z);
    view.root.setLocalScale(2.9, 2.9, 2.9);
    racerViews.set(player.id, view);
  }

  app.start();
  resize();

  return {
    setSnapshot(next) {
      snapshot = next;
    },
    getNameplates() {
      const camComp = camera.camera;
      if (!camComp) return [];
      const plates: Nameplate[] = [];
      const now = snapshot.serverNow;
      const cssW = canvas.clientWidth || 1;
      const cssH = canvas.clientHeight || 1;
      const rect = app.graphicsDevice.clientRect;
      const srcW = rect.width || cssW;
      const srcH = rect.height || cssH;
      for (const player of snapshot.players) {
        const view = racerViews.get(player.id);
        if (!view || !view.root.enabled) continue;
        const pos = view.root.getPosition();
    tmpWorld.set(pos.x, pos.y + 4.55, pos.z);
        camComp.worldToScreen(tmpWorld, tmpScreen);
        if (tmpScreen.x < -80 || tmpScreen.y < -80 || tmpScreen.x > srcW + 80 || tmpScreen.y > srcH + 80) continue;
        plates.push({
          id: player.id,
          name: player.name,
          x: (tmpScreen.x / srcW) * cssW,
          y: (tmpScreen.y / srcH) * cssH,
          progress: player.progress,
          leader: player.id === snapshot.leaderId,
          boosting: (player.boostUntil ?? 0) > now,
          finishOrder: player.finishOrder,
        });
      }
      return plates;
    },
    destroy() {
      observer.disconnect();
      app.destroy();
    },
    resize,
  };
}
