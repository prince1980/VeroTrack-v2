import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

function resetCoreEnv() {
  delete process.env.NODE_ENV;
  delete process.env.APP_STAGE;
  delete process.env.COOKIE_SECRET;
  delete process.env.CSRF_SECRET;
  delete process.env.JWT_ACCESS_SECRET;
  delete process.env.JWT_REFRESH_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.STRIPE_PRICE_MONTHLY;
  delete process.env.STRIPE_PRICE_YEARLY;
  delete process.env.COOKIE_SECURE;
  delete process.env.APP_ORIGIN;
}

async function loadEnvModule() {
  vi.resetModules();
  return import("../../src/core/config/env.js");
}

describe("env config", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetCoreEnv();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("allows development defaults", async () => {
    process.env.NODE_ENV = "development";
    process.env.APP_STAGE = "development";

    const { getEnv } = await loadEnvModule();
    const env = getEnv();

    expect(env.NODE_ENV).toBe("development");
    expect(env.PORT).toBe(4100);
  });

  it("blocks production boot with placeholder secrets", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_STAGE = "production";

    const { getEnv } = await loadEnvModule();

    expect(() => getEnv()).toThrow(/Unsafe production environment configuration/i);
  });

  it("accepts production when secure values are provided", async () => {
    process.env.NODE_ENV = "production";
    process.env.APP_STAGE = "production";
    process.env.COOKIE_SECRET = "prod-cookie-secret-abcdefghijklmnopqrstuvwxyz";
    process.env.CSRF_SECRET = "prod-csrf-secret-abcdefghijklmnopqrstuvwxyz";
    process.env.JWT_ACCESS_SECRET = "prod-access-secret-abcdefghijklmnopqrstuvwxyz";
    process.env.JWT_REFRESH_SECRET = "prod-refresh-secret-abcdefghijklmnopqrstuvwxyz";
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "prod-service-role-secret-abcdefghijklmnopqrstuvwxyz";
    process.env.SUPABASE_ANON_KEY = "prod-anon-key-abcdefghijklmnopqrstuvwxyz";
    process.env.STRIPE_SECRET_KEY = "stripe_secret_example_value_abcdefghijklmnopqrstuvwxyz";
    process.env.STRIPE_WEBHOOK_SECRET = "stripe_webhook_secret_example_value_abcdefghijklmnopqrstuvwxyz";
    process.env.STRIPE_PRICE_MONTHLY = "price_live_monthly_12345";
    process.env.STRIPE_PRICE_YEARLY = "price_live_yearly_67890";
    process.env.COOKIE_SECURE = "true";
    process.env.APP_ORIGIN = "https://app.verotrack.example";

    const { getEnv } = await loadEnvModule();
    const env = getEnv();

    expect(env.NODE_ENV).toBe("production");
    expect(env.COOKIE_SECURE).toBe(true);
    expect(env.APP_ORIGIN).toBe("https://app.verotrack.example");
  });
});
