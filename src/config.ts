import { envBool, loadConfig, nodeEnv } from "./lib/common/index.js";
import { z } from "zod";

// Dev-only default so services agree out of the box; production must set its own.
const DEV_SERVICE_TOKEN_SECRET = "dev-only-service-token-secret-change-me-in-production";

const schema = z
  .object({
    NODE_ENV: nodeEnv,
    PORT: z.coerce.number().int().default(4001),
    // Public site address, used in email links.
    FRONTEND_URL: z.url().default("http://localhost:3000"),

    DB_HOST: z.string().default("localhost"),
    DB_PORT: z.coerce.number().int().default(3306),
    MYSQL_USER: z.string().min(1),
    MYSQL_PASSWORD: z.string().min(1),
    MYSQL_DATABASE: z.string().min(1),

    // RS256 signing key: a PKCS#8 PEM (newlines as \n) or the PEM base64-encoded.
    // `pnpm gen-keys` prints a fresh pair. Optional outside production: a
    // temporary key is generated at startup (sessions end on restart).
    JWT_PRIVATE_KEY: z.string().optional(),
    JWT_KEY_ID: z.string().default("tej-1"),
    // During key rotation the old public key keeps verifying tokens until they expire.
    JWT_PREVIOUS_PUBLIC_KEY: z.string().optional(),
    JWT_PREVIOUS_KEY_ID: z.string().optional(),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

    COOKIE_SECURE: envBool(process.env.NODE_ENV === "production"),
    COOKIE_DOMAIN: z.string().optional(),

    GOOGLE_CLIENT_ID: z.string().optional(),

    // Shared by every service for service-to-service tokens (§7). At least 32
    // characters. order-service reads shoppers and saved addresses with it.
    SERVICE_TOKEN_SECRET: z.string().min(32).default(DEV_SERVICE_TOKEN_SECRET),

    // Your SMTP provider. Without SMTP_HOST (dev only), emails are written to the log instead of sent.
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_SECURE: envBool(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    MAIL_FROM: z.string().default("Tej Organics <no-reply@tejorganics.local>"),
  })
  .refine((c) => c.NODE_ENV !== "production" || c.JWT_PRIVATE_KEY, {
    message: "JWT_PRIVATE_KEY is required in production",
    path: ["JWT_PRIVATE_KEY"],
  })
  .refine((c) => c.NODE_ENV !== "production" || c.SERVICE_TOKEN_SECRET !== DEV_SERVICE_TOKEN_SECRET, {
    message: "SERVICE_TOKEN_SECRET must be set in production",
    path: ["SERVICE_TOKEN_SECRET"],
  })
  .refine((c) => c.NODE_ENV !== "production" || c.SMTP_HOST, {
    message: "SMTP_HOST is required in production",
    path: ["SMTP_HOST"],
  });

export const config = loadConfig(schema);
export type Config = typeof config;

// Google's real sign-in isn't configured, so a labelled simulation is offered (dev only).
export const googleTestMode = !config.GOOGLE_CLIENT_ID && config.NODE_ENV !== "production";
