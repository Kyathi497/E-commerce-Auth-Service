import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from "@nestjs/common";
import { CurrentUser } from "../lib/auth-guard/index.js";
import type { RequestUser } from "../lib/common/index.js";
import type { Request, Response } from "express";
import { clientMeta } from "../auth/auth.controller.js";
import { clearSessionCookies, setSessionCookies } from "../auth/cookies.js";
import { toUserView } from "../users/user-view.js";
import { AddressesService } from "./addresses.service.js";
import { CreateAddressDto, UpdateAddressDto } from "./dto/address.dto.js";
import { ChangePasswordDto, DeleteMeDto, UpdateMeDto } from "./dto/me.dto.js";
import { MeService } from "./me.service.js";

// Everything here needs a signed-in user or admin, and only ever touches
// the caller's own records (ids come from the token, never from the URL).
@Controller("me")
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly addresses: AddressesService,
  ) {}

  @Get()
  async get(@CurrentUser() user: RequestUser) {
    return { user: toUserView(await this.me.activeUser(user.id)) };
  }

  @Patch()
  async update(@CurrentUser() user: RequestUser, @Body() dto: UpdateMeDto) {
    return { user: toUserView(await this.me.update(user.id, dto)) };
  }

  @Post("password")
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.me.changePassword(user.id, dto, clientMeta(req));
    setSessionCookies(res, session.tokens);
    return { user: toUserView(session.user) };
  }

  @Get("export")
  async export(@CurrentUser() user: RequestUser, @Res({ passthrough: true }) res: Response) {
    res.setHeader("Content-Disposition", 'attachment; filename="tej-organics-my-data.json"');
    return this.me.export(user.id);
  }

  @Delete()
  @HttpCode(200)
  async delete(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteMeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.me.delete(user.id, dto, clientMeta(req));
    clearSessionCookies(res);
    return { ok: true };
  }

  @Get("addresses")
  async listAddresses(@CurrentUser() user: RequestUser) {
    await this.me.activeUser(user.id);
    return { items: await this.addresses.list(user.id) };
  }

  @Post("addresses")
  async createAddress(@CurrentUser() user: RequestUser, @Body() dto: CreateAddressDto) {
    await this.me.activeUser(user.id);
    return { address: await this.addresses.create(user.id, dto) };
  }

  @Patch("addresses/:id")
  async updateAddress(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: UpdateAddressDto) {
    await this.me.activeUser(user.id);
    return { address: await this.addresses.update(user.id, id, dto) };
  }

  @Delete("addresses/:id")
  @HttpCode(200)
  async deleteAddress(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    await this.me.activeUser(user.id);
    await this.addresses.remove(user.id, id);
    return { ok: true };
  }
}
