import { Controller, Get, Header } from "@nestjs/common";
import { Public } from "../lib/auth-guard/index.js";
import { signingKeys } from "../keys.js";

// Public keys for verifying access tokens. Internal network only: the gateway
// never routes /internal/*.
@Controller("internal/.well-known")
export class JwksController {
  @Public()
  @Get("jwks.json")
  @Header("Cache-Control", "public, max-age=300")
  jwks() {
    return signingKeys.jwks;
  }
}
