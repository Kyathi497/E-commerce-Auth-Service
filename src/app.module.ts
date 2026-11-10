import { Module } from "@nestjs/common";
import { AuthGuardModule } from "./lib/auth-guard/index.js";
import { HealthModule } from "./lib/common/index.js";
import { AdminUsersController } from "./admin/admin-users.controller.js";
import { AdminUsersService } from "./admin/admin-users.service.js";
import { AuthModule } from "./auth/auth.module.js";
import { config } from "./config.js";
import { JwksController } from "./jwks/jwks.controller.js";
import { signingKeys } from "./keys.js";
import { AddressesService } from "./me/addresses.service.js";
import { InternalUsersController } from "./me/internal-users.controller.js";
import { MeController } from "./me/me.controller.js";
import { MeService } from "./me/me.service.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PrismaService } from "./prisma/prisma.service.js";

@Module({
  imports: [
    PrismaModule,
    // auth-service verifies its own tokens with its local key, no HTTP round trip.
    AuthGuardModule.forRoot({
      keys: signingKeys.verifyKeys,
      service: { name: "auth-service", secret: config.SERVICE_TOKEN_SECRET },
    }),
    HealthModule.register({
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => ({ db: () => prisma.$queryRaw`SELECT 1` }),
    }),
    AuthModule,
  ],
  controllers: [MeController, AdminUsersController, JwksController, InternalUsersController],
  providers: [MeService, AddressesService, AdminUsersService],
})
export class AppModule {}
