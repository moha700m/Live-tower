import { Pool } from "pg";
import type { GameSnapshot, PlayerSnapshot } from "../../packages/contracts/index.ts";

export class SnapshotStore {
  private readonly pool?: Pool;
  private ready = false;
  constructor(databaseUrl?: string) {
    if (databaseUrl) this.pool = new Pool({ connectionString: databaseUrl, max: 4, idleTimeoutMillis: 30000 });
  }
  get enabled() { return Boolean(this.pool); }
  async init() {
    if (!this.pool || this.ready) return;
    await this.pool.query(`CREATE TABLE IF NOT EXISTS realtime_snapshots (
      session_id text PRIMARY KEY,
      version bigint NOT NULL,
      schema_version text NOT NULL,
      snapshot jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS viewer_progress (
      session_id text NOT NULL,
      viewer_id text NOT NULL,
      username text NOT NULL,
      nickname text NOT NULL,
      progress double precision NOT NULL DEFAULT 0,
      boost_until bigint,
      finish_order integer,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (session_id, viewer_id)
    );
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS xp double precision NOT NULL DEFAULT 0;
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS crowns integer NOT NULL DEFAULT 0;
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS podiums integer NOT NULL DEFAULT 0;
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS participations integer NOT NULL DEFAULT 0;
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS gift_points double precision NOT NULL DEFAULT 0;
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS streak integer NOT NULL DEFAULT 0;
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS likes integer NOT NULL DEFAULT 0;
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS hype double precision NOT NULL DEFAULT 0;
    ALTER TABLE viewer_progress ADD COLUMN IF NOT EXISTS best_time_ms bigint;`);
    this.ready = true;
  }
  async load(sessionId: string): Promise<GameSnapshot | undefined> {
    if (!this.pool) return undefined;
    await this.init();
    const result = await this.pool.query("SELECT snapshot FROM realtime_snapshots WHERE session_id=$1", [sessionId]);
    return result.rows[0]?.snapshot as GameSnapshot | undefined;
  }
  async save(sessionId: string, snapshot: GameSnapshot) {
    if (!this.pool) return;
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO realtime_snapshots(session_id, version, schema_version, snapshot)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(session_id) DO UPDATE SET version=EXCLUDED.version, schema_version=EXCLUDED.schema_version, snapshot=EXCLUDED.snapshot, updated_at=now()`,
        [sessionId, Number(snapshot.revision ?? 0), "1", snapshot]);
      const players: PlayerSnapshot[] = Array.isArray(snapshot.players) ? snapshot.players : [];
      const playersById = new Map(players.map((player) => [player.id, player]));
      for (const [viewerId, stats] of Object.entries(snapshot.progress ?? {})) {
        const player = playersById.get(viewerId);
        const name = player?.name ?? stats.name ?? viewerId;
        await client.query(`INSERT INTO viewer_progress(session_id,viewer_id,username,nickname,progress,boost_until,finish_order,xp,crowns,podiums,participations,gift_points,streak,likes,hype,best_time_ms)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
          ON CONFLICT(session_id,viewer_id) DO UPDATE SET username=EXCLUDED.username,nickname=EXCLUDED.nickname,progress=EXCLUDED.progress,boost_until=EXCLUDED.boost_until,finish_order=EXCLUDED.finish_order,xp=EXCLUDED.xp,crowns=EXCLUDED.crowns,podiums=EXCLUDED.podiums,participations=EXCLUDED.participations,gift_points=EXCLUDED.gift_points,streak=EXCLUDED.streak,likes=EXCLUDED.likes,hype=EXCLUDED.hype,best_time_ms=EXCLUDED.best_time_ms,updated_at=now()`,
          [sessionId, viewerId, name, name, Number(stats.progress ?? 0), player?.boostUntil ?? null, player?.finishOrder ?? null, Number(stats.xp ?? 0), Number(stats.crowns ?? 0), Number(stats.podiums ?? 0), Number(stats.participations ?? 0), Number(stats.giftPoints ?? 0), Number(stats.streak ?? 0), Number(stats.likes ?? 0), Number(stats.hype ?? 0), stats.bestTimeMs ?? null]);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async leaderboard(sessionId: string, limit = 25) {
    if (!this.pool) return [];
    await this.init();
    const result = await this.pool.query(`SELECT viewer_id AS id, username, nickname, progress, xp, crowns, podiums, participations, gift_points AS "giftPoints", streak, likes, hype, best_time_ms AS "bestTimeMs", boost_until AS "boostUntil", finish_order AS "finishOrder"
      FROM viewer_progress WHERE session_id=$1 ORDER BY crowns DESC, xp DESC, progress DESC, updated_at ASC LIMIT $2`, [sessionId, limit]);
    return result.rows;
  }
  async close() { await this.pool?.end(); }
}
