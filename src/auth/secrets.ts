import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;

// Random 256-bit token for refresh, verify and reset links. Only its SHA-256
// is stored, so a database leak can't be replayed.
export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_COST);

// A fixed hash to compare against when the email is unknown, so a miss takes
// as long as a wrong password and doesn't reveal which emails have accounts.
const DUMMY_HASH = bcrypt.hash(randomUUID(), BCRYPT_COST);

export async function verifyPassword(password: string, stored: string | null | undefined) {
  const ok = await bcrypt.compare(password, stored ?? (await DUMMY_HASH));
  return Boolean(stored) && ok;
}
