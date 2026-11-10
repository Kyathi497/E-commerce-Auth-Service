import { ACCESS_COOKIE } from "../lib/auth-guard/index.js";
import type { CookieOptions, Response } from "express";
import { config } from "../config.js";

export { ACCESS_COOKIE };
export const REFRESH_COOKIE = "tej_rt";
// The refresh token is only ever sent to auth endpoints.
export const REFRESH_PATH = "/api/v1/auth";

const base = (): CookieOptions => ({
  httpOnly: true,
  secure: config.COOKIE_SECURE,
  sameSite: "lax",
  ...(config.COOKIE_DOMAIN && { domain: config.COOKIE_DOMAIN }),
});

// Tokens only ever leave as httpOnly cookies, never in a JSON body (§6.2).
export function setSessionCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(),
    path: "/",
    maxAge: config.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(),
    path: REFRESH_PATH,
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base(), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...base(), path: REFRESH_PATH });
}
