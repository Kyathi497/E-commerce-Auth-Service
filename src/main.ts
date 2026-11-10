import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { configureApp, PinoNestLogger } from "./lib/common/index.js";
import { AppModule } from "./app.module.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bodyParser: false,
  logger: new PinoNestLogger(logger),
});
// No CORS: browsers reach this service only through the gateway, same-origin.
configureApp(app, { logger, unprefixed: ["internal/{*path}"] });
await app.listen(config.PORT, "0.0.0.0");
logger.info({ port: config.PORT }, "auth-service listening");
