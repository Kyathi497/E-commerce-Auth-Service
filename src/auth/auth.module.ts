import { Module } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { MailerService } from "../mail/mailer.service.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { CleanupService } from "./cleanup.service.js";
import { TokensService } from "./tokens.service.js";
import { VerificationService } from "./verification.service.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, TokensService, VerificationService, MailerService, AuditService, CleanupService],
  exports: [TokensService, VerificationService, AuditService],
})
export class AuthModule {}
