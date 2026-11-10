// Makes an account an admin. The only way to create the first admin; there is
// no API that lets anyone promote themselves (§6.2).
//
//   pnpm create-admin owner@example.com [--name "Owner Name"]
//
// An existing account is promoted. Otherwise a new password-less account is
// created and a 24-hour "choose your password" link is emailed and printed.
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module.js";
import { AuditService } from "../audit/audit.service.js";
import { VerificationService } from "../auth/verification.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

const args = process.argv.slice(2);
const nameFlag = args.indexOf("--name");
const name = nameFlag >= 0 ? args[nameFlag + 1]?.trim() : undefined;
const email = args.find((a, i) => !a.startsWith("--") && (nameFlag < 0 || i !== nameFlag + 1))?.trim().toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: create-admin <email> [--name "Full Name"]');
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: ["error"] });
try {
  const prisma = app.get(PrismaService);
  const audit = app.get(AuditService);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.status === "deleted") throw new Error("That account was deleted.");
    if (existing.role === "admin") {
      console.log(`${email} is already an admin.`);
    } else {
      await prisma.user.update({ where: { id: existing.id }, data: { role: "admin" } });
      await audit.record("admin.created_by_cli", { target: existing.id, meta: { promoted: true } });
      console.log(`${email} is now an admin. It applies from their next login or token refresh (within the access token lifetime).`);
    }
  } else {
    const user = await prisma.user.create({
      data: { email, name: name || email.split("@")[0]!, role: "admin" },
    });
    await audit.record("admin.created_by_cli", { target: user.id, meta: { promoted: false } });
    const link = await app.get(VerificationService).sendPasswordReset(user, 24 * 60 * 60 * 1000);
    console.log(`Created admin ${email}. A link to choose a password was emailed. It works once, for 24 hours:\n${link}`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  // Give a background email a moment to leave before the process exits.
  await new Promise((r) => setTimeout(r, 1500));
  await app.close();
}
