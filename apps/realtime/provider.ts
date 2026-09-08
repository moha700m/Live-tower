import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from "tiktok-live-connector";
import type { NormalizedEvent } from "../../packages/contracts/index.ts";

export type ProviderStatus = "disconnected" | "connecting" | "connected" | "reconnecting";
export type ProviderEventListener = (event: NormalizedEvent) => void;
export type ProviderStatusListener = (status: ProviderStatus, detail?: string) => void;

export interface LiveProvider {
  readonly name: "mock" | "tiktok";
  readonly sessionId: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  onEvent(listener: ProviderEventListener): () => void;
  onStatus(listener: ProviderStatusListener): () => void;
  getStatus?(): ProviderStatus;
}

function stableId(parts: unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

type ConnectorRecord = Record<string, unknown>;
function record(value: unknown): ConnectorRecord { return value !== null && typeof value === "object" ? value as ConnectorRecord : {}; }
function field(value: unknown, key: string): unknown { return record(value)[key]; }

function userFrom(data: unknown) {
  const user = record(field(data, "user"));
  const id = String(user.userId ?? user.id ?? user.uniqueId ?? user.unique_id ?? "anonymous");
  const username = String(user.uniqueId ?? user.unique_id ?? id);
  const nickname = String(user.nickname ?? username);
  return { providerUserId: id, username, nickname };
}

function normalized(sessionId: string, type: string, data: unknown, payload: Record<string, unknown> = {}) {
  const timestamp = Date.now();
  const viewer = userFrom(data);
  const sourceId = field(data, "eventId") ?? field(data, "msgId") ?? field(data, "messageId") ?? field(data, "id");
  return {
    eventId: String(sourceId ?? stableId([sessionId, type, timestamp, viewer.providerUserId, payload])),
    platform: "tiktok",
    timestamp,
    sessionId,
    viewer,
    type,
    payload,
  };
}

/** A deterministic, in-process source used for local development and integration tests. */
export class MockLiveProvider implements LiveProvider {
  readonly name = "mock" as const;
  private readonly events = new EventEmitter();
  private status: ProviderStatus = "disconnected";
  readonly sessionId: string;
  constructor(sessionId: string) { this.sessionId = sessionId; }

  async start() { this.setStatus("connected"); }
  async stop() { this.setStatus("disconnected"); }
  onEvent(listener: ProviderEventListener) { this.events.on("event", listener); return () => this.events.off("event", listener); }
  onStatus(listener: ProviderStatusListener) { this.events.on("status", listener); return () => this.events.off("status", listener); }
  emit(event: NormalizedEvent) { this.events.emit("event", event); }
  emitInput(type: string, viewer: Partial<{ providerUserId: string; username: string; nickname: string }> = {}, payload: Record<string, unknown> = {}) {
    const timestamp = Date.now();
    const completeViewer = { providerUserId: viewer.providerUserId ?? `mock-${Math.random().toString(36).slice(2, 8)}`, username: viewer.username ?? viewer.providerUserId ?? "mock-viewer", nickname: viewer.nickname ?? viewer.username ?? "Mock Viewer" };
    this.emit({ eventId: stableId([this.sessionId, type, timestamp, completeViewer.providerUserId, payload]), platform: "mock", timestamp, sessionId: this.sessionId, viewer: completeViewer, type, payload });
  }
  getStatus() { return this.status; }
  private setStatus(next: ProviderStatus) { this.status = next; this.events.emit("status", next); }
}

/**
 * Isolated TikTok adapter. It deliberately never accepts cookies, passwords, or
 * authenticated session options; connector access is anonymous and read-only.
 */
export class TikTokLiveProvider implements LiveProvider {
  readonly name = "tiktok" as const;
  private readonly events = new EventEmitter();
  private connection: TikTokLiveConnection | undefined;
  private readonly activeGiftStreaks = new Set<string>();
  private status: ProviderStatus = "disconnected";
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopping = false;
  readonly sessionId: string;
  private readonly uniqueId: string;

  constructor(sessionId: string, uniqueId: string) { this.sessionId = sessionId; this.uniqueId = uniqueId; }

  async start() {
    this.stopping = false;
    if (this.connection) return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
    this.setStatus("connecting");
    const connection = new TikTokLiveConnection(this.uniqueId, {
      // No session/cookie/password options: this server only observes public LIVE events.
      fetchRoomInfoOnConnect: true,
      processInitialData: false,
      enableExtendedGiftInfo: false,
    });
    this.connection = connection;
    const on = (event: string, handler: (data: unknown) => void) => connection.on(event as never, handler as never);
    on(ControlEvent.CONNECTED, () => this.setStatus("connected"));
    on(ControlEvent.DISCONNECTED, (data) => {
      this.connection = undefined;
      const reason = String(field(data, "reason") ?? "disconnected");
      if (this.stopping) { this.setStatus("disconnected", reason || "stopped"); return; }
      this.setStatus("reconnecting", reason);
      this.reconnectTimer = setTimeout(() => { void this.start().catch((error) => this.setStatus("disconnected", String(error))); }, 5000);
    });
    on(ControlEvent.ERROR, (data) => {
      const exception = record(field(data, "exception"));
      this.events.emit("status", "reconnecting", String(exception.message ?? field(data, "message") ?? "provider error"));
    });
    on(WebcastEvent.MEMBER, (data) => this.publish(normalized(this.sessionId, "VIEWER_JOIN", data, { viewerCount: field(data, "memberCount") })));
    on(WebcastEvent.CHAT, (data) => this.publish(normalized(this.sessionId, "COMMENT", data, { comment: String(field(data, "comment") ?? "").slice(0, 500) })));
    on(WebcastEvent.LIKE, (data) => this.publish(normalized(this.sessionId, "LIKE", data, { count: Number(field(data, "likeCount") ?? 1), total: Number(field(data, "totalLikeCount") ?? 0) })));
    on(WebcastEvent.FOLLOW, (data) => this.publish(normalized(this.sessionId, "FOLLOW", data)));
    on(WebcastEvent.SHARE, (data) => this.publish(normalized(this.sessionId, "SHARE", data)));
    on(WebcastEvent.ROOM_USER, (data) => this.publish(normalized(this.sessionId, "VIEWER_COUNT", data, { count: Number(field(data, "viewerCount") ?? 0) })));
    on(WebcastEvent.GIFT, (data) => this.handleGift(data));
    try {
      await connection.connect();
    } catch (error) {
      this.connection = undefined;
      this.setStatus("disconnected", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async stop() {
    this.stopping = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined; }
    const connection = this.connection;
    this.connection = undefined;
    if (connection) {
      try { await connection.disconnect(); } catch { /* already disconnected */ }
    }
    this.setStatus("disconnected");
  }
  onEvent(listener: ProviderEventListener) { this.events.on("event", listener); return () => this.events.off("event", listener); }
  onStatus(listener: ProviderStatusListener) { this.events.on("status", listener); return () => this.events.off("status", listener); }
  getStatus() { return this.status; }

  private handleGift(data: unknown) {
    const details = record(field(data, "giftDetails"));
    const giftType = Number(details.giftType ?? field(data, "giftType") ?? 0);
    const giftId = String(field(data, "giftId") ?? details.giftId ?? "unknown-gift");
    const user = userFrom(data);
    const streakKey = `${user.providerUserId}:${giftId}`;
    // Gift type 1 emits intermediate increments and one final repeatEnd event.
    if (giftType === 1 && !field(data, "repeatEnd")) {
      this.activeGiftStreaks.add(streakKey);
      return;
    }
    this.activeGiftStreaks.delete(streakKey);
    this.publish(normalized(this.sessionId, "GIFT", data, {
      giftId,
      giftName: details.giftName ?? field(data, "giftName") ?? "Gift",
      repeatCount: Number(field(data, "repeatCount") ?? 1),
      repeatEnd: Boolean(field(data, "repeatEnd") ?? true),
      giftType,
    }));
  }
  private publish(event: NormalizedEvent) { this.events.emit("event", event); }
  private setStatus(next: ProviderStatus, detail?: string) { this.status = next; this.events.emit("status", next, detail); }
}
