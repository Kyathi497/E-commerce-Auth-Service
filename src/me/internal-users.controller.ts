import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { InternalOnly } from "../lib/auth-guard/index.js";
import { AppError } from "../lib/common/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toAddressView } from "./addresses.service.js";

const uuid = new ParseUUIDPipe();
const notFound = () => new AppError(404, "NOT_FOUND", "No such user.");

// order-service reads the shopper and a saved address at checkout (§6.7).
// Only active accounts are answered.
@InternalOnly("order-service")
@Controller("internal/users")
export class InternalUsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id")
  async user(@Param("id", uuid) id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u || u.status !== "active") throw notFound();
    return { user: { id: u.id, email: u.email, name: u.name, phone: u.phone, status: u.status } };
  }

  @Get(":id/addresses/:addressId")
  async address(@Param("id", uuid) id: string, @Param("addressId", uuid) addressId: string) {
    const a = await this.prisma.address.findFirst({ where: { id: addressId, userId: id, user: { status: "active" } } });
    if (!a) throw notFound();
    return { address: toAddressView(a) };
  }
}
