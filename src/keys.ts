import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject, webcrypto } from "node:crypto";
import { createLocalJWKSet } from "jose";
import { config } from "./config.js";
import { logger } from "./logger.js";

// Accepts a PEM with literal "\n" (env files can't hold newlines) or base64 of the PEM.
export function readPem(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("-----BEGIN") ? trimmed.replace(/\\n/g, "\n") : Buffer.from(trimmed, "base64").toString("utf8");
}

function toJwk(key: KeyObject, kid: string) {
  return { ...(createPublicKey(key).export({ format: "jwk" }) as webcrypto.JsonWebKey), kid, alg: "RS256", use: "sig" };
}

function load() {
  let privateKey: KeyObject;
  if (config.JWT_PRIVATE_KEY) {
    privateKey = createPrivateKey(readPem(config.JWT_PRIVATE_KEY));
  } else {
    logger.warn("JWT_PRIVATE_KEY is not set: using a temporary key. Everyone is logged out on restart. Run `pnpm gen-keys`.");
    privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  }

  const keys = [toJwk(privateKey, config.JWT_KEY_ID)];
  if (config.JWT_PREVIOUS_PUBLIC_KEY && config.JWT_PREVIOUS_KEY_ID) {
    keys.push(toJwk(createPublicKey(readPem(config.JWT_PREVIOUS_PUBLIC_KEY)), config.JWT_PREVIOUS_KEY_ID));
  }
  const jwks = { keys };
  return { privateKey, kid: config.JWT_KEY_ID, jwks, verifyKeys: createLocalJWKSet(jwks as never) };
}

// Loaded once at startup; published at /internal/.well-known/jwks.json.
export const signingKeys = load();
