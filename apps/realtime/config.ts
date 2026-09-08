import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  // Browsers send an origin without a trailing slash. Normalize Render/Vercel
  // values here so Socket.IO's exact CORS comparison cannot reject the app.
  WEB_ORIGIN: z.string().default("http://localhost:4173").transform((value) => value.replace(/\/+$/, "")),
  SESSION_ID: z.string().min(1).default("rise966"),
  PROVIDER: z.enum(["mock", "tiktok"]).default("mock"),
  TIKTOK_UNIQUE_ID: z.string().optional(),
  CONTROL_TOKEN: z.string().optional(),
  OVERLAY_TOKEN: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
});

export type RealtimeConfig = z.infer<typeof envSchema>;
export function loadConfig(source: NodeJS.ProcessEnv = process.env): RealtimeConfig {
  const parsed = envSchema.parse(source);
  if (parsed.PROVIDER === "tiktok" && !parsed.TIKTOK_UNIQUE_ID) throw new Error("TIKTOK_UNIQUE_ID is required when PROVIDER=tiktok");
  if (parsed.NODE_ENV !== "development" && parsed.NODE_ENV !== "test" && !parsed.CONTROL_TOKEN) throw new Error("CONTROL_TOKEN is required outside local/test mode");
  return parsed;
}
