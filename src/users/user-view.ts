import type { User } from "../generated/prisma/client.js";

// What the signed-in user sees about themselves. Never includes hashes or tokens.
export function toUserView(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    emailVerified: u.emailVerifiedAt !== null,
    hasPassword: u.passwordHash !== null,
    googleLinked: u.googleId !== null,
    marketingOptIn: u.marketingOptIn,
    createdAt: u.createdAt,
  };
}

// The admin view adds account state.
export function toAdminUserView(u: User) {
  return {
    ...toUserView(u),
    status: u.status,
    failedLogins: u.failedLogins,
    lockedUntil: u.lockedUntil,
    updatedAt: u.updatedAt,
  };
}

export type UserView = ReturnType<typeof toUserView>;
