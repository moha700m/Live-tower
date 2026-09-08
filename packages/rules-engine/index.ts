import type { EngineConfig, EventPayload, GameRules, NormalizedEvent } from "../contracts/index.ts";

/** The default event mapping used by the browser and the realtime server. */
export const DEFAULT_RULES: GameRules = {
  join: {
    follow: true,
    viewerJoin: true,
    commentKeywords: ["ادخل", "دخل", "join", "start", "انضم"],
  },
  giftProgress: { rose: 1, gift: 3, rocket: 8 },
  routeSegments: 48,
  xp: { follow: 2, viewerJoin: 1, comment: 1, like: 1, share: 3, gift: 3 },
  boosts: { durationMs: 8_000, maxProgress: 0.08, multiplier: 1.18 },
  eventDedup: { ttlMs: 15 * 60_000, maxEntries: 4_096 },
};

const own = (value: unknown, key: string): unknown =>
  value !== null && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;

const numberOr = (value: unknown, fallback: number): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/** Merge nested rule objects without allowing caller data to mutate defaults. */
export function mergeRules(config?: EngineConfig | Partial<GameRules>): GameRules {
  const candidate = (config && "rules" in config ? config.rules : config) as Partial<GameRules> | undefined;
  const dynamic = (candidate ?? {}) as Record<string, unknown>;
  const join = (candidate?.join ?? {}) as Partial<GameRules["join"]>;
  const gifts = (candidate?.giftProgress ?? {
    rose: own(dynamic, "rose"), gift: own(dynamic, "gift"), rocket: own(dynamic, "rocket"),
  }) as Partial<GameRules["giftProgress"]>;
  const xp = (candidate?.xp ?? {}) as Partial<GameRules["xp"]>;
  const boosts = (candidate?.boosts ?? {}) as Partial<GameRules["boosts"]>;
  const dedup = (candidate?.eventDedup ?? {}) as Partial<GameRules["eventDedup"]>;

  const result: GameRules = {
    join: {
      follow: join.follow ?? (own(dynamic, "followJoins") as boolean | undefined) ?? DEFAULT_RULES.join.follow,
      viewerJoin: join.viewerJoin ?? DEFAULT_RULES.join.viewerJoin,
      commentKeywords: [...(join.commentKeywords ?? (own(dynamic, "commentJoinPhrase") ? [String(own(dynamic, "commentJoinPhrase"))] : DEFAULT_RULES.join.commentKeywords))],
    },
    giftProgress: {
      rose: Math.max(0, numberOr(gifts.rose, DEFAULT_RULES.giftProgress.rose)),
      gift: Math.max(0, numberOr(gifts.gift, DEFAULT_RULES.giftProgress.gift)),
      rocket: Math.max(0, numberOr(gifts.rocket, DEFAULT_RULES.giftProgress.rocket)),
    },
    routeSegments: Math.max(1, Math.floor(numberOr(candidate?.routeSegments, DEFAULT_RULES.routeSegments))),
    xp: {
      follow: Math.max(0, numberOr(xp.follow, DEFAULT_RULES.xp.follow)),
      viewerJoin: Math.max(0, numberOr(xp.viewerJoin, DEFAULT_RULES.xp.viewerJoin)),
      comment: Math.max(0, numberOr(xp.comment, DEFAULT_RULES.xp.comment)),
      like: Math.max(0, numberOr(xp.like, DEFAULT_RULES.xp.like)),
      share: Math.max(0, numberOr(xp.share, DEFAULT_RULES.xp.share)),
      gift: Math.max(0, numberOr(xp.gift, DEFAULT_RULES.xp.gift)),
    },
    boosts: {
      durationMs: Math.max(0, numberOr(boosts.durationMs, DEFAULT_RULES.boosts.durationMs)),
      maxProgress: Math.max(0, Math.min(1, numberOr(boosts.maxProgress, DEFAULT_RULES.boosts.maxProgress))),
      multiplier: Math.max(1, numberOr(boosts.multiplier, DEFAULT_RULES.boosts.multiplier)),
    },
    eventDedup: {
      ttlMs: Math.max(1_000, numberOr(dedup.ttlMs, DEFAULT_RULES.eventDedup.ttlMs)),
      maxEntries: Math.max(16, Math.floor(numberOr(dedup.maxEntries, DEFAULT_RULES.eventDedup.maxEntries))),
    },
  };
  return result;
}

/** Extract a readable gift name from the several provider payload shapes. */
export function giftName(payload?: EventPayload): string {
  if (!payload) return "gift";
  const value = own(payload, "giftName") ?? own(payload, "giftKey") ?? own(payload, "giftId")
    ?? own(payload, "name") ?? own(payload, "gift") ?? own(payload, "type");
  return String(value ?? "gift").trim().toLocaleLowerCase();
}

export function giftQuantity(payload?: EventPayload): number {
  if (!payload) return 1;
  const value = own(payload, "quantity") ?? own(payload, "count") ?? own(payload, "repeatCount");
  return Math.min(100, Math.max(1, Math.floor(numberOr(value, 1))));
}

export function isJoinComment(event: NormalizedEvent, rules: GameRules = DEFAULT_RULES): boolean {
  if (event.type !== "COMMENT") return false;
  const payload = event.payload;
  const raw = own(payload, "text") ?? own(payload, "comment") ?? own(payload, "content") ?? "";
  const text = String(raw).toLocaleLowerCase();
  return rules.join.commentKeywords.some((keyword) => text.includes(String(keyword).toLocaleLowerCase()));
}

/** Return route points represented by one gift, before quantity is applied. */
export function giftPoints(payload?: EventPayload, rules: GameRules = DEFAULT_RULES): number {
  // Providers disagree on the field name. Treat each field as a candidate, but
  // require an exact token match so "rocketship" cannot become a rocket.
  const candidates = ["giftId", "giftKey", "giftName", "name", "gift", "type"]
    .map((key) => own(payload, key))
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).trim().toLocaleLowerCase());
  if (candidates.some((name) => name === "rocket" || name === "🚀")) return rules.giftProgress.rocket;
  if (candidates.some((name) => name === "rose" || name === "🌹" || name === "flower")) return rules.giftProgress.rose;
  return rules.giftProgress.gift;
}

export function eventXp(event: NormalizedEvent, rules: GameRules = DEFAULT_RULES): number {
  switch (event.type) {
    case "FOLLOW": return rules.xp.follow;
    case "VIEWER_JOIN": return rules.xp.viewerJoin;
    case "COMMENT": return rules.xp.comment;
    case "LIKE": return rules.xp.like;
    case "SHARE": return rules.xp.share;
    case "GIFT": return rules.xp.gift * giftQuantity(event.payload);
    default: return 0;
  }
}

export function isJoinEvent(event: NormalizedEvent, rules: GameRules = DEFAULT_RULES): boolean {
  return (event.type === "VIEWER_JOIN" && rules.join.viewerJoin)
    || (event.type === "FOLLOW" && rules.join.follow)
    || isJoinComment(event, rules);
}
