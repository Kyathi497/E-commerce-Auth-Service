import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { CurrentUser, Public, readCookie } from "../lib/auth-guard/index.js";
import type { RequestUser } from "../lib/common/index.js";
import type { Request, Response } from "express";
import { toUserView } from "../users/user-view.js";
import { AuthService } from "./auth.service.js";
import { clearSessionCookies, REFRESH_COOKIE, setSessionCookies } from "./cookies.js";
import { GoogleLoginDto } from "./dto/google-login.dto.js";
import { GoogleTestDto } from "./dto/google-test.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from "./dto/password.dto.js";
import { RegisterDto } from "./dto/register.dto.js";
import type { ClientMeta, SessionTokens } from "./tokens.service.js";
import type { User } from "../generated/prisma/client.js";

export const clientMeta = (req: Request): ClientMeta => ({ ip: req.ip, userAgent: req.get("user-agent") });

// Sets the cookies and answers with { user } only; tokens never go in the body.
function respond(res: Response, { user, tokens }: { user: User; tokens: SessionTokens }) {
  setSessionCookies(res, tokens);
  res.setHeader("Cache-Control", "no-store");
  return { user: toUserView(user) };
}

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return respond(res, await this.auth.register(dto, clientMeta(req)));
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return respond(res, await this.auth.login(dto, clientMeta(req)));
  }

  @Public()
  @Post("google")
  @HttpCode(200)
  async google(@Body() dto: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return respond(res, await this.auth.googleLogin(dto.idToken, clientMeta(req)));
  }

  @Public()
  @Post("google/test")
  @HttpCode(200)
  async googleTest(@Body() dto: GoogleTestDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return respond(res, await this.auth.googleTestLogin(dto.email, clientMeta(req)));
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return respond(res, await this.auth.refresh(readCookie(req.headers.cookie, REFRESH_COOKIE), clientMeta(req)));
    } catch (e) {
      // A dead refresh token can never work again: drop the cookies with the 401.
      if ((e as { getStatus?: () => number }).getStatus?.() === 401) clearSessionCookies(res);
      throw e;
    }
  }

  // Works with only the refresh cookie, so an expired access token can still log out.
  @Public()
  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(readCookie(req.headers.cookie, REFRESH_COOKIE));
    clearSessionCookies(res);
    return { ok: true };
  }

  @Post("logout-all")
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: RequestUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logoutAll(user.id, clientMeta(req));
    clearSessionCookies(res);
    return { ok: true };
  }

  @Public()
  @Post("password/forgot")
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Public()
  @Post("password/reset")
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return respond(res, await this.auth.resetPassword(dto.token, dto.password, clientMeta(req)));
  }

  @Public()
  @Post("email/verify")
  @HttpCode(200)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.auth.verifyEmail(dto.token);
    return { ok: true };
  }

  @Post("email/resend")
  @HttpCode(200)
  async resendVerification(@CurrentUser() user: RequestUser) {
    return { ok: true, ...(await this.auth.resendVerification(user.id)) };
  }
}
