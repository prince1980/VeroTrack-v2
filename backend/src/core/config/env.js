import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_STAGE: z.enum(["development", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4100),
  APP_ORIGIN: z.string().url().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  COOKIE_SECRET: z.string().min(16).default("local-cookie-secret-123456789"),
  COOKIE_SECURE: z.preprocess((v) => toBoolean(v), z.boolean()).default(false),
  CSRF_SECRET: z.string().min(24).default("local-csrf-secret-12345678901234567890"),

  JWT_ACCESS_SECRET: z.string().min(24).default("local-access-secret-1234567890"),
  JWT_REFRESH_SECRET: z.string().min(24).default("local-refresh-secret-123456789"),
  JWT_ACCESS_EXPIRES_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().min(1).max(90).default(30),

  RATE_LIMIT_IP_WINDOW_MS: z.coerce.number().int().min(60_000).default(15 * 60 * 1000),
  RATE_LIMIT_IP_MAX: z.coerce.number().int().min(10).default(300),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().min(60_000).default(10 * 60 * 1000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(5).default(60),
  RATE_LIMIT_USER_WINDOW_MS: z.coerce.number().int().min(10_000).default(60 * 1000),
  RATE_LIMIT_USER_MAX: z.coerce.number().int().min(10).default(120),

  SUPABASE_URL: z.string().url().default("https://example.supabase.co"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(24).default("service-role-placeholder-123456"),
  SUPABASE_ANON_KEY: z.string().min(24).default("anon-key-placeholder-123456789"),

  STRIPE_SECRET_KEY: z.string().min(10).default("sk_test_placeholder"),
  STRIPE_WEBHOOK_SECRET: z.string().min(10).default("whsec_placeholder"),
  STRIPE_PRICE_MONTHLY: z.string().min(5).default("price_monthly_placeholder"),
  STRIPE_PRICE_YEARLY: z.string().min(5).default("price_yearly_placeholder"),

  FREE_DAILY_LOG_LIMIT: z.coerce.number().int().min(1).max(1000).default(20),
  ENABLE_JOBS: z.preprocess((v) => toBoolean(v), z.boolean()).default(false),
  JOBS_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

let cachedEnv = null;

const SECRET_KEYS = [
  "COOKIE_SECRET",
  "CSRF_SECRET",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ANON_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_YEARLY",
];

function isProductionLike(env) {
  return env.NODE_ENV === "production" || env.APP_STAGE === "production";
}

function looksPlaceholderSecret(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("placeholder") ||
    normalized.startsWith("local-") ||
    normalized.startsWith("example-")
  );
}

function assertProductionEnvSafety(env) {
  if (!isProductionLike(env)) return;

  const invalid = [];

  for (const key of SECRET_KEYS) {
    if (looksPlaceholderSecret(env[key])) {
      invalid.push(key);
    }
  }

  if (!env.COOKIE_SECURE) {
    invalid.push("COOKIE_SECURE");
  }

  if (!String(env.APP_ORIGIN || "").toLowerCase().startsWith("https://")) {
    invalid.push("APP_ORIGIN");
  }

  if (invalid.length > 0) {
    throw new Error(
      `Unsafe production environment configuration. Fix: ${invalid.join(", ")}`
    );
  }
}

export function getEnv() {
  if (cachedEnv) return cachedEnv;
  cachedEnv = envSchema.parse(process.env);
  assertProductionEnvSafety(cachedEnv);
  return cachedEnv;
}
