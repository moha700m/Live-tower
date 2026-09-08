/** Shared, serialisable contracts for the Live Tower simulation. */

export type Phase =
  | "WAITING"
  | "COUNTDOWN"
  | "ACTIVE"
  | "FINAL_RUSH"
  | "PODIUM"
  | "TRANSITION";
export type GamePhase = Phase;

export type Platform = string;

export type NormalizedEventType =
  | "FOLLOW"
  | "VIEWER_JOIN"
  | "GIFT"
  | "LIKE"
  | "COMMENT"
  | "SHARE"
  | "VIEWER_LEAVE"
  | "SUBSCRIBE"
  | "ADMIN";

export interface EventViewer {
  providerUserId: string;
  username?: string;
  nickname?: string;
}

export type EventPayload = Record<string, unknown>;

export interface NormalizedEvent {
  eventId: string;
  platform: Platform;
  timestamp: number;
  sessionId: string;
  viewer: EventViewer;
  type: NormalizedEventType | string;
  payload?: EventPayload;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  appearance: string;
  progress: number;
  boostUntil?: number;
  finishOrder?: number;
  joinedAt: number;
  /** Internal timing/bookkeeping needed to resume without replaying progress. */
  lastProgressAt?: number;
  boostProgress?: number;
  giftProgress?: number;
  speedDurationMs?: number;
  platform?: Platform;
  providerUserId?: string;
}

export interface QueuedViewer {
  id: string;
  name: string;
  appearance: string;
  joinedAt: number;
  platform?: Platform;
  providerUserId?: string;
}

export interface ViewerStats {
  /** Display name captured from the provider; useful for leaderboards. */
  name?: string;
  progress: number;
  xp: number;
  crowns: number;
  podiums: number;
  participations: number;
  giftPoints: number;
  streak: number;
  bestTimeMs?: number;
  likes: number;
  hype: number;
}

export type ProgressRecord = Record<string, ViewerStats>;

export interface FeedItem {
  id: string;
  text: string;
  at?: number;
  type?: string;
}

export interface GameSnapshot {
  phase: Phase;
  round: number;
  worldIndex: number;
  phaseEndsAt: number | null;
  /** Monotonic server clock used to render this snapshot. */
  serverNow: number;
  /** Alias retained for consumers that call the clock nowMs. */
  nowMs: number;
  players: PlayerSnapshot[];
  queue: QueuedViewer[];
  leaderId?: string;
  feed: FeedItem[];
  progress: ProgressRecord;
  likes: number;
  hype: number;
  eventName: string;
  revision: number;
  /** ID of the winner of the current round, when one has finished. */
  winnerId?: string;
  seed?: number;
  /** Persisted engine bookkeeping used for lossless server restart. */
  activeStartAt?: number | null;
  finishCounter?: number;
  paused?: boolean;
  dedup?: Record<string, number>;
  globalBoostUntil?: number;
  globalMultiplier?: number;
  sandstormUntil?: number;
  pausedAt?: number;
  rules?: GameRules;
  nextAutoEventAt?: number;
  autoEventKind?: "SPEED" | "LOWGRAV" | "LUCKY";
  autoEventUntil?: number;
}
export type Snapshot = GameSnapshot;

export type JoinRule = boolean | string[];

export interface GameRules {
  /** Events that admit a viewer to a round. */
  join: {
    follow: boolean;
    viewerJoin: boolean;
    commentKeywords: string[];
  };
  /** Progress points awarded by gifts. One route has routeSegments points. */
  giftProgress: {
    rose: number;
    gift: number;
    rocket: number;
  };
  routeSegments: number;
  xp: {
    follow: number;
    viewerJoin: number;
    comment: number;
    like: number;
    share: number;
    gift: number;
  };
  boosts: {
    /** Duration in milliseconds for a gift boost. */
    durationMs: number;
    /** Maximum bonus progress (as route fractions) from boosts. */
    maxProgress: number;
    /** Multiplier while a boost is active. */
    multiplier: number;
  };
  /** Maximum number of remembered event IDs and their retention period. */
  eventDedup: {
    ttlMs: number;
    maxEntries: number;
  };
}

export interface EngineConfig extends Partial<Omit<GameRules, "join" | "giftProgress" | "xp" | "boosts" | "eventDedup">> {
  maxPlayers?: number;
  lateQueueThresholdMs?: number;
  countdownMs?: number;
  raceMs?: number;
  finalRushMs?: number;
  podiumMs?: number;
  transitionMs?: number;
  seed?: number | string;
  rules?: PartialGameRules;
  /** Aliases accepted by UI/config files. */
  worldIndex?: number;
  world?: number;
}

export interface PartialGameRules {
  routeSegments?: number;
  join?: Partial<GameRules["join"]>;
  giftProgress?: Partial<GameRules["giftProgress"]>;
  xp?: Partial<GameRules["xp"]>;
  boosts?: Partial<GameRules["boosts"]>;
  eventDedup?: Partial<GameRules["eventDedup"]>;
}

export interface EngineOptions {
  nowMs?: number;
  initialState?: Partial<GameSnapshot> | GameSnapshot;
  config?: EngineConfig;
}

export type SnapshotListener = (snapshot: GameSnapshot) => void;

export type EngineControl =
  | { type: "FINAL_RUSH"; value?: unknown }
  | { type: "EVENT"; event?: NormalizedEvent; value?: unknown }
  | { type: "RESET"; worldIndex?: number; value?: unknown }
  | { type: "PAUSE"; value?: unknown }
  | { type: "RESUME"; value?: unknown }
  | { type: "WORLD"; worldIndex?: number; value?: unknown }
  | { type: "RULES"; rules?: PartialGameRules; value?: unknown };

export interface Engine {
  getSnapshot(): GameSnapshot;
  dispatch(event: NormalizedEvent, receivedAtMs?: number): GameSnapshot;
  advance(nowMs: number): GameSnapshot;
  subscribe(listener: SnapshotListener): () => void;
  /** Trusted host controls. Socket adapters should keep this method private. */
  control(control: EngineControl, nowMs?: number): GameSnapshot;
}
