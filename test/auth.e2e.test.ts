// End-to-end checks for Phase 1, through the API gateway, against the running
// stack (run auth-service and api-gateway with `docker compose up --build`
// in each folder), then:  pnpm test:e2e
// GATEWAY_URL overrides the default below.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const GATEWAY = process.env.GATEWAY_URL ?? "http://localhost:4000";

// A tiny browser: keeps cookies per path and sends them where a browser would.
class Browser {
  cookies = new Map<string, { value: string; path: string }>();

  async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const cookie = [...this.cookies]
      .filter(([, c]) => path.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join("; ");
    const res = await fetch(`${GATEWAY}${path}`, {
      method,
      headers: {
        ...(method !== "GET" && { "Content-Type": "application/json" }),
        ...(cookie && { Cookie: cookie }),
        ...headers,
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(";").map((s) => s.trim());
      const eq = pair!.indexOf("=");
      const name = pair!.slice(0, eq);
      const value = pair!.slice(eq + 1);
      const path = attrs.find((a) => a.toLowerCase().startsWith("path="))?.slice(5) ?? "/";
      const expired = !value || attrs.some((a) => /^expires=/i.test(a) && new Date(a.slice(8)) < new Date());
      if (expired) this.cookies.delete(name);
      else this.cookies.set(name, { value, path });
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data, headers: res.headers };
  }
}

const newEmail = () => `e2e-${randomUUID().slice(0, 8)}@example.com`;
const PASSWORD = "correct horse battery";

async function registered() {
  const browser = new Browser();
  const email = newEmail();
  const res = await browser.call("POST", "/api/v1/auth/register", { name: "Lakshmi Prasanna", email, password: PASSWORD });
  expect(res.status).toBe(201);
  return { browser, email, user: res.data.user };
}

describe("register / login / session cookies", () => {
  it("register sets httpOnly cookies and never returns a token in the body", async () => {
    const browser = new Browser();
    const email = newEmail();
    const res = await browser.call("POST", "/api/v1/auth/register", { name: "Ravi", email, password: PASSWORD });
    expect(res.status).toBe(201);
    expect(res.data.user).toMatchObject({ email, role: "user", emailVerified: false });
    expect(JSON.stringify(res.data)).not.toMatch(/token/i);

    const setCookies = res.headers.getSetCookie();
    const at = setCookies.find((c) => c.startsWith("tej_at="))!;
    const rt = setCookies.find((c) => c.startsWith("tej_rt="))!;
    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=Lax/i);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/);

    const me = await browser.call("GET", "/api/v1/me");
    expect(me.status).toBe(200);
    expect(me.data.user.email).toBe(email);
  });

  it("rejects a duplicate email with a field error", async () => {
    const { email } = await registered();
    const res = await new Browser().call("POST", "/api/v1/auth/register", { name: "Someone", email, password: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.data).toMatchObject({ code: "EMAIL_TAKEN", fields: { email: expect.any(String) } });
  });

  it("validates input with the storefront's wording", async () => {
    const res = await new Browser().call("POST", "/api/v1/auth/register", { name: "", email: "nope", password: "short" });
    expect(res.status).toBe(422);
    expect(res.data.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(res.data.fields).sort()).toEqual(["email", "name", "password"]);
  });

  it("logs in with the right password only", async () => {
    const { email } = await registered();
    const browser = new Browser();
    expect((await browser.call("POST", "/api/v1/auth/login", { email, password: "wrong password" })).status).toBe(401);
    const ok = await browser.call("POST", "/api/v1/auth/login", { email: email.toUpperCase(), password: PASSWORD });
    expect(ok.status).toBe(200);
    expect((await browser.call("GET", "/api/v1/me")).status).toBe(200);
  });

  it("logout revokes the session and clears cookies", async () => {
    const { browser } = await registered();
    const rt = browser.cookies.get("tej_rt")!.value;
    expect((await browser.call("POST", "/api/v1/auth/logout")).status).toBe(200);
    expect(browser.cookies.size).toBe(0);
    const reuse = new Browser();
    reuse.cookies.set("tej_rt", { value: rt, path: "/api/v1/auth" });
    expect((await reuse.call("POST", "/api/v1/auth/refresh")).status).toBe(401);
  });
});

describe("refresh token rotation", () => {
  it("rotates the pair on every refresh", async () => {
    const { browser } = await registered();
    const before = { ...browser.cookies.get("tej_rt")! };
    const res = await browser.call("POST", "/api/v1/auth/refresh");
    expect(res.status).toBe(200);
    expect(browser.cookies.get("tej_rt")!.value).not.toBe(before.value);
    expect((await browser.call("GET", "/api/v1/me")).status).toBe(200);
  });

  it("reusing a rotated token revokes the whole family", async () => {
    const { browser } = await registered();
    const stolen = browser.cookies.get("tej_rt")!.value;
    expect((await browser.call("POST", "/api/v1/auth/refresh")).status).toBe(200);

    // Inside the 10 s race window a reuse is treated as a concurrent refresh.
    const thief = new Browser();
    thief.cookies.set("tej_rt", { value: stolen, path: "/api/v1/auth" });
    expect((await thief.call("POST", "/api/v1/auth/refresh")).status).toBe(409);

    await new Promise((r) => setTimeout(r, 10_500));
    expect((await thief.call("POST", "/api/v1/auth/refresh")).status).toBe(401);
    // The legitimate holder's newer token died with the family.
    expect((await browser.call("POST", "/api/v1/auth/refresh")).status).toBe(401);
  }, 30_000);
});

describe("roles and the gateway", () => {
  it("a user gets 403 on /admin/*, a visitor 401", async () => {
    const { browser } = await registered();
    const asUser = await browser.call("GET", "/api/v1/admin/users");
    expect(asUser.status).toBe(403);
    expect(asUser.data.code).toBe("FORBIDDEN");
    expect((await new Browser().call("GET", "/api/v1/admin/users")).status).toBe(401);
  });

  it("ignores spoofed identity headers", async () => {
    const res = await new Browser().call("GET", "/api/v1/me", undefined, { "x-user-id": "someone", "x-user-role": "admin" });
    expect(res.status).toBe(401);
  });

  it("never exposes internal endpoints", async () => {
    expect((await new Browser().call("GET", "/internal/.well-known/jwks.json")).status).toBe(404);
    expect((await new Browser().call("GET", "/api/v1/internal/.well-known/jwks.json")).status).toBe(404);
  });

  it("rejects cross-site style writes", async () => {
    const form = await fetch(`${GATEWAY}/api/v1/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "a=1",
    });
    expect(form.status).toBe(415);
    const foreign = await new Browser().call("POST", "/api/v1/auth/logout", {}, { Origin: "https://evil.example" });
    expect(foreign.status).toBe(403);
  });

  it("every response carries a request id", async () => {
    const res = await new Browser().call("GET", "/api/v1/me");
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.data.requestId).toBe(res.headers.get("x-request-id"));
  });
});

describe("address book", () => {
  it("creates, defaults, validates and deletes addresses", async () => {
    const { browser } = await registered();
    const home = {
      name: "Lakshmi Prasanna",
      phone: "+91 98480 12345",
      line1: "12-4-7, Gandhi Nagar",
      city: "Vijayawada",
      state: "andhra pradesh",
      pincode: "520003",
    };
    const first = await browser.call("POST", "/api/v1/me/addresses", home);
    expect(first.status).toBe(201);
    expect(first.data.address).toMatchObject({ phone: "9848012345", state: "Andhra Pradesh", isDefault: true, label: "Home" });

    const second = await browser.call("POST", "/api/v1/me/addresses", { ...home, label: "Work", isDefault: true });
    const list = await browser.call("GET", "/api/v1/me/addresses");
    expect(list.data.items.map((a: { id: string }) => a.id)).toEqual([second.data.address.id, first.data.address.id]);
    expect(list.data.items.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);

    const bad = await browser.call("POST", "/api/v1/me/addresses", { ...home, pincode: "12345", phone: "12345" });
    expect(bad.status).toBe(422);
    expect(Object.keys(bad.data.fields).sort()).toEqual(["phone", "pincode"]);

    expect((await browser.call("DELETE", `/api/v1/me/addresses/${second.data.address.id}`)).status).toBe(200);
    const after = await browser.call("GET", "/api/v1/me/addresses");
    expect(after.data.items).toHaveLength(1);
    expect(after.data.items[0].isDefault).toBe(true);
  });

  it("can't touch another user's address", async () => {
    const owner = await registered();
    const created = await owner.browser.call("POST", "/api/v1/me/addresses", {
      name: "Owner",
      phone: "9848012345",
      line1: "1 Temple Street, Main Road",
      city: "Guntur",
      state: "Andhra Pradesh",
      pincode: "522001",
    });
    const other = await registered();
    const res = await other.browser.call("DELETE", `/api/v1/me/addresses/${created.data.address.id}`);
    expect(res.status).toBe(404);
  });
});

