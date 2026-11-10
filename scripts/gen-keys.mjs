// Prints a fresh RS256 key pair as env lines for auth-service.
//   pnpm gen-keys >> .env
// Rotation: move the current public key to JWT_PREVIOUS_PUBLIC_KEY (with its
// id in JWT_PREVIOUS_KEY_ID), set the new private key and a new JWT_KEY_ID,
// deploy, and drop the previous key once ACCESS_TOKEN_TTL_SECONDS have passed.
import { generateKeyPairSync } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const b64 = (pem) => Buffer.from(pem).toString("base64");
const kid = `tej-${new Date().toISOString().slice(0, 10)}`;

console.log(`JWT_KEY_ID=${kid}`);
console.log(`JWT_PRIVATE_KEY=${b64(privateKey.export({ type: "pkcs8", format: "pem" }))}`);
console.log(`# public key, for JWT_PREVIOUS_PUBLIC_KEY during the next rotation:`);
console.log(`# ${b64(publicKey.export({ type: "spki", format: "pem" }))}`);
