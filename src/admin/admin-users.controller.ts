import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import { CurrentUser, Roles } from "../lib/auth-guard/index.js";
import type { RequestUser } from "../lib/common/index.js";
import type { Request } from "express";
import { AdminUsersService } from "./admin-users.service.js";
import { ListUsersQuery, UpdateUserDto } from "./dto/admin-users.dto.js";

// Checked here as well as at the gateway (§10).
@Roles("admin")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.users.get(id);
  }

  @Patch(":id")
  update(@CurrentUser() admin: RequestUser, @Param("id") id: string, @Body() dto: UpdateUserDto, @Req() req: Request) {
    return this.users.update(admin.id, id, dto, req.ip);
  }
}
