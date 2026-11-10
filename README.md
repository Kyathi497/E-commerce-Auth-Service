# auth-service

Accounts, login (email + Google), RS256 access tokens + rotating refresh tokens (httpOnly cookies), JWKS, addresses. Port 4001.

## Run

```sh
docker network create tej-net   # once per machine
docker compose up --build       # service + MySQL (3307); emails use the SMTP server in .env
```

Hot reload: `docker compose up mysql`, then `pnpm install && pnpm dev` (uses `.env`, see `.env.example`).

## Commands

- `pnpm test`: unit tests · `pnpm test:e2e`: end-to-end through the running api-gateway
- `pnpm migrate:dev` / `pnpm migrate:deploy`: Prisma migrations
- `pnpm gen-keys >> .env`: RS256 signing key · `pnpm build && pnpm create-admin you@example.com`

## Shared code

`src/lib/common` and `src/lib/auth-guard` are shared libraries copied into this service. If you fix a bug in one,
make the same fix in every other service that has a copy.
