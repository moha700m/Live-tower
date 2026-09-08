import type {
  Engine,
  EngineControl,
  EngineOptions,
  FeedItem,
  GameRules,
  GameSnapshot,
  NormalizedEvent,
  PlayerSnapshot,
  ProgressRecord,
  QueuedViewer,
  SnapshotListener,
  ViewerStats,
} from "../contracts/index.ts";
import { eventXp, giftName, giftPoints, giftQuantity, isJoinEvent, mergeRules } from "../rules-engine/index.ts";

const PHASES = ["WAITING", "COUNTDOWN", "ACTIVE", "FINAL_RUSH", "PODIUM", "TRANSITION"] as const;
const hasOwn = (value: unknown, key: string): boolean => value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);
const read = (value: unknown, key: string): unknown => hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
const finite = (value: unknown, fallback: number): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const text = (value: unknown, fallback: string): string => String(value ?? fallback).slice(0, 160);
const ownRecord = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
const safeDefine = <T>(record: Record<string, T>, key: string, value: T): void => { Object.defineProperty(record, key, { value, enumerable: true, configurable: true, writable: true }); };

interface InternalPlayer extends PlayerSnapshot {
  platform: string;
  providerUserId: string;
  lastProgressAt: number;
  speedDurationMs: number;
  boostProgress: number;
  giftProgress: number;
}

interface InternalQueued extends QueuedViewer {
  platform: string;
  providerUserId: string;
}

interface InternalState {
  now: number;
  phase: GameSnapshot["phase"];
  phaseEndsAt: number | null;
  round: number;
  worldIndex: number;
  eventName: string;
  winnerId?: string;
  leaderId?: string;
  likes: number;
  hype: number;
  feed: FeedItem[];
  revision: number;
  players: Map<string, InternalPlayer>;
  queue: Map<string, InternalQueued>;
  stats: Map<string, ViewerStats>;
  dedup: Map<string, number>;
  finishCounter: number;
  activeStartAt: number | null;
  paused: boolean;
  pausedAt?: number;
  globalBoostUntil?: number;
  globalMultiplier: number;
  sandstormUntil?: number;
  nextAutoEventAt?: number;
  autoEventKind?: "SPEED" | "LOWGRAV" | "LUCKY";
  autoEventUntil?: number;
}

const hash = (input: string): number => {
  let value = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
};

const copyStats = (stats: ViewerStats): ViewerStats => ({ ...stats });
const copyPlayer = (player: PlayerSnapshot): PlayerSnapshot => ({ ...player });
const copyQueue = (viewer: QueuedViewer): QueuedViewer => ({ ...viewer });
const copySnapshot = (snapshot: GameSnapshot): GameSnapshot => {
  const progress = ownRecord<ViewerStats>();
  for (const [id, value] of Object.entries(snapshot.progress ?? {})) safeDefine(progress, id, copyStats(value));
  const dedup = ownRecord<number>();
  for (const [id, seenAt] of Object.entries(snapshot.dedup ?? {})) safeDefine(dedup, id, seenAt);
  return {
    ...snapshot,
    players: snapshot.players.map(copyPlayer),
    queue: snapshot.queue.map(copyQueue),
    feed: snapshot.feed.map((item) => ({ ...item })),
    progress,
    dedup,
  };
};

export function stableViewerId(platform: string, providerUserId: string): string {
  return `${String(platform || "unknown")}:${String(providerUserId || "anonymous")}`;
}

export function createEngine(options: EngineOptions = {}): Engine {
  const initial = options.initialState;
  const config = options.config ?? {};
  let rules: GameRules = mergeRules(config);
  const initialRules = read(initial, "rules");
  if (!config.rules && initialRules && typeof initialRules === "object") rules = mergeRules(initialRules as Partial<GameRules>);
  const maxPlayers = Math.max(1, Math.floor(finite(config.maxPlayers, 30)));
  const countdownMs = Math.max(0, finite(config.countdownMs, 10_000));
  const raceMs = Math.max(1, finite(config.raceMs, 180_000));
  const finalRushMs = Math.max(0, Math.min(raceMs, finite(config.finalRushMs, 30_000)));
  const podiumMs = Math.max(0, finite(config.podiumMs, 10_000));
  const transitionMs = Math.max(0, finite(config.transitionMs, 3_000));
  const lateQueueThresholdMs = Math.max(0, finite(config.lateQueueThresholdMs, 15_000));
  const configuredSeed = config.seed ?? 0;
  const seed = typeof configuredSeed === "number" ? configuredSeed : hash(String(configuredSeed));
  const listeners = new Set<SnapshotListener>();
  const initialNow = options.nowMs ?? finite(read(initial, "serverNow"), finite(read(initial, "nowMs"), Date.now()));

  const state: InternalState = {
    now: initialNow,
    phase: PHASES.includes(read(initial, "phase") as GameSnapshot["phase"]) ? read(initial, "phase") as GameSnapshot["phase"] : "WAITING",
    phaseEndsAt: read(initial, "phaseEndsAt") === null || read(initial, "phaseEndsAt") === undefined ? null : finite(read(initial, "phaseEndsAt"), 0),
    round: Math.max(1, Math.floor(finite(read(initial, "round"), 1))),
    worldIndex: Math.max(0, Math.floor(finite(read(initial, "worldIndex"), config.worldIndex ?? config.world ?? 0))),
    eventName: text(read(initial, "eventName"), "Live Tower"),
    winnerId: typeof read(initial, "winnerId") === "string" ? String(read(initial, "winnerId")) : undefined,
    leaderId: typeof read(initial, "leaderId") === "string" ? String(read(initial, "leaderId")) : undefined,
    likes: Math.min(10_000, Math.max(0, finite(read(initial, "likes"), 0))),
    hype: Math.max(0, finite(read(initial, "hype"), 0)),
    feed: Array.isArray(read(initial, "feed")) ? (read(initial, "feed") as FeedItem[]).slice(-20).map((item) => ({ ...item })) : [],
    revision: Math.max(0, Math.floor(finite(read(initial, "revision"), 0))),
    players: new Map(),
    queue: new Map(),
    stats: new Map(),
    dedup: new Map(),
    finishCounter: Math.max(0, Math.floor(finite(read(initial, "finishCounter"), 0))),
    activeStartAt: read(initial, "activeStartAt") === null ? null : finite(read(initial, "activeStartAt"), 0),
    paused: read(initial, "paused") === true,
    pausedAt: read(initial, "paused") === true ? finite(read(initial, "pausedAt"), initialNow) : undefined,
    globalBoostUntil: finite(read(initial, "globalBoostUntil"), 0) || undefined,
    globalMultiplier: Math.max(1, finite(read(initial, "globalMultiplier"), 1)),
    sandstormUntil: finite(read(initial, "sandstormUntil"), 0) || undefined,
    nextAutoEventAt: finite(read(initial, "nextAutoEventAt"), 0) || undefined,
    autoEventKind: ["SPEED", "LOWGRAV", "LUCKY"].includes(String(read(initial, "autoEventKind")))
      ? read(initial, "autoEventKind") as "SPEED" | "LOWGRAV" | "LUCKY" : undefined,
    autoEventUntil: finite(read(initial, "autoEventUntil"), 0) || undefined,
  };
  if (state.activeStartAt === null && state.phase === "ACTIVE" && state.phaseEndsAt !== null) state.activeStartAt = state.phaseEndsAt - Math.max(0, raceMs - finalRushMs);
  if (state.activeStartAt === null && state.phase === "FINAL_RUSH" && state.phaseEndsAt !== null) state.activeStartAt = state.phaseEndsAt - finalRushMs - Math.max(0, raceMs - finalRushMs);
  if (state.nextAutoEventAt === undefined && state.activeStartAt !== null && (state.phase === "ACTIVE" || state.phase === "FINAL_RUSH")) state.nextAutoEventAt = state.activeStartAt + 45_000;
  const initialDedup = read(initial, "dedup");
  if (initialDedup && typeof initialDedup === "object") {
    for (const [id, seenAt] of Object.entries(initialDedup as Record<string, number>)) {
      if (id && typeof seenAt === "number" && Number.isFinite(seenAt) && state.now - seenAt <= rules.eventDedup.ttlMs) state.dedup.set(id, seenAt);
    }
    while (state.dedup.size > rules.eventDedup.maxEntries) state.dedup.delete(state.dedup.keys().next().value as string);
  }

  const initialProgress = read(initial, "progress");
  if (initialProgress && typeof initialProgress === "object") {
    for (const [id, source] of Object.entries(initialProgress as Record<string, ViewerStats>)) {
      const value = source ?? ({} as ViewerStats);
      state.stats.set(id, {
        name: typeof value.name === "string" ? value.name : undefined,
        progress: clamp01(finite(value.progress, 0)), xp: Math.max(0, finite(value.xp, 0)), crowns: Math.max(0, finite(value.crowns, 0)),
        podiums: Math.max(0, finite(value.podiums, 0)), participations: Math.max(0, finite(value.participations, 0)),
        giftPoints: Math.max(0, finite(value.giftPoints, 0)), streak: Math.max(0, finite(value.streak, 0)),
        bestTimeMs: value.bestTimeMs === undefined ? undefined : Math.max(0, finite(value.bestTimeMs, 0)),
        likes: Math.min(10_000, Math.max(0, finite(value.likes, 0))), hype: Math.max(0, finite(value.hype, 0)),
      });
    }
  }

  const basePlayer = (source: Partial<PlayerSnapshot> & { id?: string; platform?: string; providerUserId?: string }, at: number, restoring = false): InternalPlayer => {
    const id = text(source.id, stableViewerId(text(source.platform, "unknown"), text(source.providerUserId, "anonymous")));
    const duration = 140_000 + (hash(`${seed}:${id}:${state.round}`) % 40_001);
    return {
      id, name: text(source.name, id.split(":").slice(1).join(":") || "Climber"), appearance: text(source.appearance, `rider-${hash(id) % 12}`),
      progress: clamp01(finite(source.progress, 0)), boostUntil: source.boostUntil === undefined ? undefined : finite(source.boostUntil, 0),
      finishOrder: source.finishOrder === undefined ? undefined : Math.max(1, Math.floor(finite(source.finishOrder, 1))), joinedAt: finite(source.joinedAt, at),
      platform: text(source.platform, id.split(":")[0] || "unknown"), providerUserId: text(source.providerUserId, id.split(":").slice(1).join(":") || id),
      lastProgressAt: restoring ? finite(source.lastProgressAt, at) : at,
      speedDurationMs: Math.max(1, finite(source.speedDurationMs, duration)),
      boostProgress: clamp01(finite(source.boostProgress, 0)),
      giftProgress: clamp01(finite(source.giftProgress, 0)),
    };
  };

  const sourcePlayers = read(initial, "players");
  if (Array.isArray(sourcePlayers)) {
    for (const source of sourcePlayers as PlayerSnapshot[]) {
      const player = basePlayer(source, finite(source.joinedAt, state.now), true);
      state.players.set(player.id, player);
      if (player.finishOrder !== undefined) state.finishCounter = Math.max(state.finishCounter, player.finishOrder);
      if (!state.stats.has(player.id)) state.stats.set(player.id, newStats(player.progress));
    }
  }
  if (!state.winnerId) state.winnerId = [...state.players.values()].find((player) => player.finishOrder === 1)?.id;
  const sourceQueue = read(initial, "queue");
  if (Array.isArray(sourceQueue)) {
    for (const source of sourceQueue as QueuedViewer[]) {
      const id = text(source.id, "unknown:queued");
      state.queue.set(id, { ...copyQueue(source), id, name: text(source.name, "Climber"), appearance: text(source.appearance, `rider-${hash(id) % 12}`), joinedAt: finite(source.joinedAt, state.now), platform: text(source.platform, id.split(":")[0]), providerUserId: text(source.providerUserId, id.split(":").slice(1).join(":")) });
    }
  }

  function newStats(progress = 0): ViewerStats {
    return { progress: clamp01(progress), xp: 0, crowns: 0, podiums: 0, participations: 0, giftPoints: 0, streak: 0, likes: 0, hype: 0 };
  }
  function getStats(id: string): ViewerStats {
    let stats = state.stats.get(id);
    if (!stats) { stats = newStats(); state.stats.set(id, stats); }
    return stats;
  }
  function cleanDedup(now: number): void {
    for (const [id, seenAt] of state.dedup) if (now - seenAt > rules.eventDedup.ttlMs) state.dedup.delete(id);
    while (state.dedup.size > rules.eventDedup.maxEntries) {
      const oldest = state.dedup.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      state.dedup.delete(oldest);
    }
  }
  function feed(id: string, message: string, at: number, type = "event"): void {
    state.feed.push({ id, text: message.slice(0, 180), at, type });
    if (state.feed.length > 20) state.feed.splice(0, state.feed.length - 20);
  }
  function markParticipation(player: InternalPlayer): void {
    const stats = getStats(player.id);
    stats.name = player.name;
    stats.participations += 1;
    stats.progress = 0;
  }
  function finish(player: InternalPlayer, at: number): void {
    player.progress = 1;
    getStats(player.id).progress = 1;
    if (player.finishOrder !== undefined) return;
    state.finishCounter += 1;
    player.finishOrder = state.finishCounter;
    const stats = getStats(player.id);
    const isWinner = state.winnerId === undefined;
    if (isWinner) { stats.crowns += 1; stats.streak += 1; }
    else stats.streak = 0;
    const time = state.activeStartAt === null ? undefined : Math.max(0, at - state.activeStartAt);
    if (time !== undefined && (stats.bestTimeMs === undefined || time < stats.bestTimeMs)) stats.bestTimeMs = time;
    if (isWinner) {
      state.winnerId = player.id;
      state.leaderId = player.id;
      feed(`finish:${player.id}:${player.finishOrder}`, `${player.name} reached the crown!`, at, "finish");
    }
  }
  function recomputeLeader(): void {
    if (state.winnerId && state.players.has(state.winnerId)) { state.leaderId = state.winnerId; return; }
    let leader: InternalPlayer | undefined;
    for (const player of state.players.values()) if (!leader || player.progress > leader.progress || (player.progress === leader.progress && player.joinedAt < leader.joinedAt)) leader = player;
    state.leaderId = leader?.id;
  }
  function autoMultiplierAt(at: number): number {
    if (state.autoEventUntil === undefined || state.autoEventUntil <= at) return 1;
    if (state.autoEventKind === "SPEED") return 1.2;
    if (state.autoEventKind === "LOWGRAV") return 1.1;
    return 1.14;
  }
  function updateProgress(to: number, multiplier = 1): void {
    if (state.phase !== "ACTIVE" && state.phase !== "FINAL_RUSH") return;
    const crossing: Array<{ player: InternalPlayer; at: number }> = [];
    for (const player of state.players.values()) {
      const from = Math.max(player.lastProgressAt, state.activeStartAt ?? player.lastProgressAt);
      if (to > from && player.progress < 1) {
        let cursor = from;
        // Every expiry is an integration boundary. This keeps a large server
        // tick from applying a boost or weather effect beyond its deadline.
        const boundaries = [to, state.globalBoostUntil, state.sandstormUntil, state.autoEventUntil, player.boostUntil]
          .filter((value): value is number => value !== undefined && value > cursor && value < to)
          .sort((a, b) => a - b);
        boundaries.push(to);
        for (const end of boundaries) {
          if (end <= cursor || player.progress >= 1) { cursor = end; continue; }
          const global = state.globalBoostUntil !== undefined && state.globalBoostUntil > cursor ? state.globalMultiplier : 1;
          const weather = state.sandstormUntil !== undefined && state.sandstormUntil > cursor ? 0.78 : 1;
          const auto = autoMultiplierAt(cursor);
          const baseRate = multiplier * global * weather * auto / player.speedDurationMs;
          const boosted = player.boostUntil !== undefined && player.boostUntil > cursor;
          const duration = end - cursor;
          const extraRate = boosted ? baseRate * Math.max(0, rules.boosts.multiplier - 1) : 0;
          const extraAvailable = Math.max(0, Math.min(
            rules.boosts.maxProgress - player.boostProgress,
            0.35 - player.giftProgress,
          ));
          const extraMs = extraRate > 0 ? Math.min(duration, extraAvailable / extraRate) : 0;
          const boostedMs = Math.min(duration, extraMs);
          const firstRate = baseRate + extraRate;
          const firstDistance = boostedMs * firstRate;
          const secondDistance = (duration - boostedMs) * baseRate;
          const before = player.progress;
          const need = Math.max(0, 1 - before);
          let crossingDelta: number | undefined;
          if (need <= firstDistance && firstRate > 0) crossingDelta = need / firstRate;
          else if (need <= firstDistance + secondDistance && baseRate > 0) crossingDelta = boostedMs + Math.max(0, need - firstDistance) / baseRate;
          player.progress = clamp01(before + firstDistance + secondDistance);
          const bonus = boostedMs * extraRate;
          player.boostProgress = clamp01(player.boostProgress + bonus);
          player.giftProgress = clamp01(player.giftProgress + bonus);
          getStats(player.id).progress = player.progress;
          if (crossingDelta !== undefined) {
            crossing.push({ player, at: cursor + Math.min(duration, crossingDelta) });
            cursor = end;
            break;
          }
          cursor = end;
          if (player.boostUntil !== undefined && player.boostUntil <= cursor) player.boostProgress = 0;
        }
      }
      player.lastProgressAt = to;
    }
    crossing.sort((a, b) => a.at - b.at || a.player.joinedAt - b.player.joinedAt || a.player.id.localeCompare(b.player.id));
    for (const item of crossing) finish(item.player, item.at);
    recomputeLeader();
  }
  function roundEndAt(): number | null {
    if (state.phase === "ACTIVE" && state.phaseEndsAt !== null) return state.phaseEndsAt + finalRushMs;
    return state.phase === "FINAL_RUSH" || state.phase === "PODIUM" ? state.phaseEndsAt : null;
  }
  function setPhase(phase: GameSnapshot["phase"], endsAt: number | null, at: number): void {
    state.phase = phase;
    state.phaseEndsAt = endsAt;
    state.now = at;
    if (phase === "ACTIVE") {
      state.activeStartAt = at;
      state.nextAutoEventAt = at + 45_000;
      state.autoEventKind = undefined;
      state.autoEventUntil = undefined;
    }
    if (phase === "ACTIVE" || phase === "FINAL_RUSH") for (const player of state.players.values()) player.lastProgressAt = at;
  }
  function runAutoEvent(at: number): void {
    const kind = (["SPEED", "LOWGRAV", "LUCKY"] as const)[hash(`${seed}:${state.round}:${Math.floor(at / 45_000)}`) % 3]!;
    state.autoEventKind = kind;
    state.autoEventUntil = at + 12_000;
    state.nextAutoEventAt = at + 45_000;
    state.eventName = kind;
    const arabic = kind === "SPEED" ? "سرعة" : kind === "LOWGRAV" ? "جاذبية منخفضة" : "حظ سعيد";
    feed(`auto:${kind}:${at}`, `${kind} / ${arabic}: the tower event is active.`, at, "auto");
  }
  function startNextRound(at: number): void {
    const lineup = new Map<string, InternalPlayer>();
    // Queued viewers are placed first, so a late viewer never loses their FIFO place.
    for (const viewer of state.queue.values()) {
      if (lineup.size >= maxPlayers) break;
      const player = basePlayer(viewer, at);
      lineup.set(player.id, player);
    }
    const consumed = new Set(lineup.keys());
    for (const player of state.players.values()) {
      if (lineup.size >= maxPlayers) break;
      if (!consumed.has(player.id)) lineup.set(player.id, basePlayer(player, at));
    }
    for (const id of lineup.keys()) state.queue.delete(id);
    state.players = lineup;
    state.round += 1;
    state.worldIndex = (state.worldIndex + 1) % 5;
    state.winnerId = undefined;
    state.leaderId = undefined;
    state.finishCounter = 0;
    state.activeStartAt = null;
    state.nextAutoEventAt = undefined;
    state.autoEventKind = undefined;
    state.autoEventUntil = undefined;
    state.eventName = `Tower ${state.worldIndex + 1}`;
    for (const player of state.players.values()) {
      player.progress = 0; player.finishOrder = undefined; player.boostUntil = undefined; player.boostProgress = 0; player.lastProgressAt = at;
      markParticipation(player);
    }
    if (state.players.size === 0) setPhase("WAITING", null, at);
    else setPhase("COUNTDOWN", at + countdownMs, at);
  }
  function enterPodium(at: number): void {
    updateProgress(at, 1.35);
    if (!state.winnerId && state.leaderId) {
      const player = state.players.get(state.leaderId);
      if (player) finish(player, at);
    }
    const podium = [...state.players.values()].sort((a, b) => (a.finishOrder ?? 999) - (b.finishOrder ?? 999) || b.progress - a.progress).slice(0, 3);
    const podiumXp = [100, 60, 40];
    for (let index = 0; index < podium.length; index += 1) {
      const stats = getStats(podium[index]!.id);
      stats.podiums += 1;
      stats.xp += podiumXp[index] ?? 0;
    }
    setPhase("PODIUM", at + podiumMs, at);
  }
  function advanceInternal(target: number): boolean {
    if (state.paused) return false;
    target = Math.max(state.now, finite(target, state.now));
    let changed = target !== state.now;
    while (state.phase !== "WAITING") {
      const phaseBoundary = state.phaseEndsAt ?? Number.POSITIVE_INFINITY;
      const autoBoundary = (state.phase === "ACTIVE" || state.phase === "FINAL_RUSH") && state.nextAutoEventAt !== undefined
        ? state.nextAutoEventAt : Number.POSITIVE_INFINITY;
      const expiryBoundary = state.autoEventUntil ?? Number.POSITIVE_INFINITY;
      const boundary = Math.min(phaseBoundary, autoBoundary, expiryBoundary);
      if (boundary > target) break;
      state.now = boundary;
      if (expiryBoundary === boundary && state.autoEventUntil !== undefined) {
        updateProgress(boundary, state.phase === "FINAL_RUSH" ? 1.35 : 1);
        state.autoEventKind = undefined;
        state.autoEventUntil = undefined;
        changed = true;
        continue;
      }
      if (autoBoundary === boundary && state.nextAutoEventAt !== undefined) {
        updateProgress(boundary, state.phase === "FINAL_RUSH" ? 1.35 : 1);
        runAutoEvent(boundary);
        changed = true;
        continue;
      }
      if (phaseBoundary !== boundary || state.phaseEndsAt === null) break;
      if (state.phase === "COUNTDOWN") { setPhase("ACTIVE", boundary + Math.max(0, raceMs - finalRushMs), boundary); }
      else if (state.phase === "ACTIVE") { updateProgress(boundary); state.eventName = "FINAL RUSH"; setPhase("FINAL_RUSH", boundary + finalRushMs, boundary); }
      else if (state.phase === "FINAL_RUSH") { updateProgress(boundary, 1.35); enterPodium(boundary); }
      else if (state.phase === "PODIUM") { setPhase("TRANSITION", boundary + transitionMs, boundary); }
      else if (state.phase === "TRANSITION") { startNextRound(boundary); }
      changed = true;
    }
    if (target > state.now) {
      if (state.phase === "ACTIVE") updateProgress(target);
      else if (state.phase === "FINAL_RUSH") updateProgress(target, 1.35);
      state.now = target;
      changed = true;
    }
    cleanDedup(state.now);
    return changed;
  }
  function viewerFrom(event: NormalizedEvent): { id: string; name: string; platform: string; providerUserId: string; appearance: string } {
    const platform = text(event.platform, "unknown");
    const providerUserId = text(event.viewer?.providerUserId, "anonymous");
    const id = stableViewerId(platform, providerUserId);
    const name = text(event.viewer?.nickname ?? event.viewer?.username, providerUserId);
    return { id, name, platform, providerUserId, appearance: `rider-${hash(id) % 12}` };
  }
  function addViewer(event: NormalizedEvent, at: number): InternalPlayer | undefined {
    const viewer = viewerFrom(event);
    const existing = state.players.get(viewer.id);
    if (existing) return existing;
    const queued = state.queue.get(viewer.id);
    if (queued) { queued.name = viewer.name; return undefined; }
    const remaining = roundEndAt();
    const late = remaining !== null && remaining - at < lateQueueThresholdMs;
    const direct = state.phase === "WAITING" || state.phase === "COUNTDOWN"
      || ((state.phase === "ACTIVE" || state.phase === "FINAL_RUSH") && !late && state.players.size < maxPlayers);
    if (!direct || state.players.size >= maxPlayers || state.phase === "PODIUM" || state.phase === "TRANSITION") {
      if (state.queue.size >= maxPlayers) return undefined;
      state.queue.set(viewer.id, { ...viewer, joinedAt: at });
      feed(`queue:${viewer.id}:${at}`, `${viewer.name} is queued for the next tower. / ${viewer.name} في قائمة الانتظار.`, at, "queue");
      return undefined;
    }
    const player = basePlayer({ ...viewer, id: viewer.id, name: viewer.name, joinedAt: at }, at);
    state.players.set(player.id, player);
    getStats(player.id);
    markParticipation(player);
    feed(`join:${viewer.id}:${at}`, `${viewer.name} joined the tower. / ${viewer.name} انضم للبرج.`, at, "join");
    if (state.phase === "WAITING") setPhase("COUNTDOWN", at + countdownMs, at);
    return player;
  }
  function applyEvent(event: NormalizedEvent, at: number): void {
    const viewer = viewerFrom(event);
    const stats = getStats(viewer.id);
    stats.name = viewer.name;
    const shouldJoin = isJoinEvent(event, rules);
    let player = state.players.get(viewer.id);
    if (shouldJoin) player = addViewer(event, at) ?? player;
    else if (!player && event.type === "GIFT" && state.phase !== "WAITING") player = addViewer(event, at) ?? player;
    stats.xp += eventXp(event, rules);
    const rawAmount = Math.max(1, Math.floor(finite(read(event.payload, "amount") ?? read(event.payload, "count"), 1)));
    const amount = event.type === "LIKE" ? Math.min(10_000, rawAmount) : rawAmount;
    if (event.type === "LIKE") {
      const beforeLikes = state.likes;
      stats.likes = Math.min(10_000, stats.likes + amount); state.likes = Math.min(10_000, state.likes + amount); state.hype += amount;
      if (Math.floor(state.likes / 1_000) > Math.floor(beforeLikes / 1_000)) {
        state.globalBoostUntil = Math.max(state.globalBoostUntil ?? 0, at + 10_000);
        state.globalMultiplier = 1.1;
        feed(`milestone:${Math.floor(state.likes / 1_000)}`, "The crowd unlocked a tower boost!", at, "milestone");
      }
    }
    if (event.type === "SHARE") {
      state.hype += amount * 2;
      state.globalBoostUntil = Math.max(state.globalBoostUntil ?? 0, at + 5_000);
      state.globalMultiplier = 1.06;
    }
    if (event.type === "COMMENT") { stats.hype += 1; state.hype += 1; }
    if (event.type === "GIFT") {
      const points = giftPoints(event.payload, rules) * giftQuantity(event.payload);
      stats.giftPoints += points;
      if (player && (state.phase === "ACTIVE" || state.phase === "FINAL_RUSH")) {
        const giftBudget = Math.max(0, 0.35 - player.giftProgress);
        const applied = Math.min(giftBudget, points / rules.routeSegments);
        player.giftProgress = clamp01(player.giftProgress + applied);
        player.progress = clamp01(player.progress + applied);
        player.boostUntil = Math.max(player.boostUntil ?? 0, at + rules.boosts.durationMs);
        stats.progress = player.progress;
        if (player.progress >= 1) finish(player, at);
      }
      state.hype += points;
    }
    const payloadName = read(event.payload, "eventName") ?? read(event.payload, "label");
    if (payloadName) state.eventName = text(payloadName, state.eventName);
    const display = event.type === "GIFT"
      ? `${viewer.name} sent ${giftName(event.payload)}. / ${viewer.name} أرسل هدية.`
      : event.type === "FOLLOW" ? `${viewer.name} joined the tower. / ${viewer.name} انضم للبرج.`
        : `${viewer.name}: ${event.type.toLowerCase()}`;
    feed(event.eventId || `${event.type}:${at}`, display, at, event.type);
    recomputeLeader();
  }
  function snapshot(): GameSnapshot {
    const players = [...state.players.values()].map((player) => ({
      id: player.id, name: player.name, appearance: player.appearance, progress: clamp01(player.progress),
      ...(player.boostUntil === undefined ? {} : { boostUntil: player.boostUntil }),
      ...(player.finishOrder === undefined ? {} : { finishOrder: player.finishOrder }), joinedAt: player.joinedAt,
      lastProgressAt: player.lastProgressAt, boostProgress: player.boostProgress, giftProgress: player.giftProgress,
      speedDurationMs: player.speedDurationMs, platform: player.platform, providerUserId: player.providerUserId,
    }));
    const queue = [...state.queue.values()].map((viewer) => ({ id: viewer.id, name: viewer.name, appearance: viewer.appearance, joinedAt: viewer.joinedAt, platform: viewer.platform, providerUserId: viewer.providerUserId }));
    const progress: ProgressRecord = ownRecord<ViewerStats>();
    for (const player of players) getStats(player.id).progress = player.progress;
    for (const [id, value] of state.stats) safeDefine(progress, id, copyStats(value));
    return {
      phase: state.phase, round: state.round, worldIndex: state.worldIndex, phaseEndsAt: state.phaseEndsAt, serverNow: state.now, nowMs: state.now,
      players, queue, ...(state.leaderId ? { leaderId: state.leaderId } : {}), feed: state.feed.map((item) => ({ ...item })), progress,
      likes: state.likes, hype: state.hype, eventName: state.eventName, revision: state.revision, ...(state.winnerId ? { winnerId: state.winnerId } : {}), seed,
      activeStartAt: state.activeStartAt, finishCounter: state.finishCounter, paused: state.paused,
      pausedAt: state.pausedAt, rules: structuredClone(rules),
      dedup: (() => { const result = ownRecord<number>(); for (const [id, seenAt] of state.dedup) safeDefine(result, id, seenAt); return result; })(),
      ...(state.globalBoostUntil ? { globalBoostUntil: state.globalBoostUntil } : {}), globalMultiplier: state.globalMultiplier,
      ...(state.sandstormUntil ? { sandstormUntil: state.sandstormUntil } : {}),
      ...(state.nextAutoEventAt ? { nextAutoEventAt: state.nextAutoEventAt } : {}),
      ...(state.autoEventKind ? { autoEventKind: state.autoEventKind } : {}),
      ...(state.autoEventUntil ? { autoEventUntil: state.autoEventUntil } : {}),
    };
  }
  recomputeLeader();
  let current = snapshot();
  function commit(changed: boolean): GameSnapshot {
    if (!changed) return copySnapshot(current);
    state.revision += 1;
    current = snapshot();
    const emitted = copySnapshot(current);
    for (const listener of listeners) { try { listener(emitted); } catch { /* one subscriber must not stop the engine */ } }
    return copySnapshot(current);
  }
  function dispatch(event: NormalizedEvent, receivedAtMs?: number): GameSnapshot {
    const at = state.paused ? state.now : Math.max(state.now, finite(receivedAtMs, finite(event?.timestamp, state.now)));
    let changed = advanceInternal(at);
    const eventId = text(event?.eventId, `${event?.type ?? "event"}:${at}:${event?.viewer?.providerUserId ?? "anonymous"}`);
    cleanDedup(at);
    if (state.dedup.has(eventId)) return commit(changed);
    state.dedup.set(eventId, at);
    applyEvent({ ...event, eventId }, at);
    changed = true;
    return commit(changed);
  }
  function advance(nowMs: number): GameSnapshot { return commit(advanceInternal(nowMs)); }
  function control(control: EngineControl, nowMs?: number): GameSnapshot {
    if (control.type === "EVENT") {
      if (control.event) return dispatch(control.event, nowMs);
      const at = state.paused ? state.now : Math.max(state.now, finite(nowMs, state.now));
      const label = text(control.value, state.eventName).toUpperCase();
      if (label.includes("SANDSTORM")) {
        state.sandstormUntil = at + 12_000;
        state.eventName = "SANDSTORM";
        feed(`weather:${at}`, "Sandstorm: the tower fights back.", at, "weather");
      } else state.eventName = label;
      state.now = at;
      return commit(true);
    }
    const at = Math.max(state.now, finite(nowMs, state.now));
    let changed = advanceInternal(at);
    if (control.type === "FINAL_RUSH" && state.phase === "ACTIVE") { updateProgress(at); setPhase("FINAL_RUSH", at + finalRushMs, at); changed = true; }
    else if (control.type === "RESET") {
      if (control.worldIndex !== undefined || control.value !== undefined) state.worldIndex = Math.max(0, Math.floor(finite(control.worldIndex ?? control.value, state.worldIndex))) % 5;
      state.feed = []; state.likes = 0; state.hype = 0; state.winnerId = undefined; state.leaderId = undefined; state.eventName = "Live Tower";
      // Start a new round while retaining the roster and persistent stats.
      state.round = Math.max(1, state.round);
      state.worldIndex = (state.worldIndex + 4) % 5;
      startNextRound(at);
      changed = true;
    } else if (control.type === "PAUSE") { if (!state.paused) { state.paused = true; state.pausedAt = at; changed = true; } }
    else if (control.type === "RESUME") {
      if (state.paused) {
        const shift = Math.max(0, at - (state.pausedAt ?? state.now));
        if (state.phaseEndsAt !== null) state.phaseEndsAt += shift;
        if (state.activeStartAt !== null) state.activeStartAt += shift;
        if (state.globalBoostUntil !== undefined) state.globalBoostUntil += shift;
        if (state.sandstormUntil !== undefined) state.sandstormUntil += shift;
        if (state.nextAutoEventAt !== undefined) state.nextAutoEventAt += shift;
        if (state.autoEventUntil !== undefined) state.autoEventUntil += shift;
        if (state.autoEventUntil !== undefined && state.autoEventUntil <= at) {
          state.autoEventKind = undefined;
          state.autoEventUntil = undefined;
        }
        for (const player of state.players.values()) if (player.boostUntil !== undefined) player.boostUntil += shift;
        for (const player of state.players.values()) player.lastProgressAt += shift;
        state.paused = false; state.pausedAt = undefined; state.now = at; changed = true;
      }
    }
    else if (control.type === "WORLD") { state.worldIndex = Math.max(0, Math.floor(finite(control.worldIndex ?? control.value, state.worldIndex))); changed = true; }
    else if (control.type === "RULES") {
      const value = (control.rules ?? control.value ?? {}) as Record<string, unknown>;
      const shorthand = hasOwn(value, "rose") || hasOwn(value, "gift") || hasOwn(value, "rocket") ? { giftProgress: value } : value;
      rules = mergeRules({ rules: shorthand as Partial<GameRules> }); changed = true;
    }
    return commit(changed);
  }

  const engine: Engine = {
    getSnapshot: () => copySnapshot(current),
    dispatch,
    advance,
    subscribe(listener: SnapshotListener): () => void { listeners.add(listener); return () => listeners.delete(listener); },
    control,
  };
  return engine;
}

export type { Engine, EngineConfig, EngineOptions, GameSnapshot, NormalizedEvent, SnapshotListener } from "../contracts/index.ts";
export { DEFAULT_RULES } from "../rules-engine/index.ts";
