import { Injectable } from "@nestjs/common";
import { AppError } from "../lib/common/index.js";
import type { Address } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreateAddressDto, UpdateAddressDto } from "./dto/address.dto.js";

const MAX_ADDRESSES = 20;

const notFound = () => new AppError(404, "ADDRESS_NOT_FOUND", "We couldn't find that address. Please refresh and try again.");

export function toAddressView({ userId: _userId, ...address }: Address) {
  return address;
}

// The address book used by checkout and the account area (§6.2). Exactly one
// address is the default whenever the book isn't empty.
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toAddressView);
  }

  async create(userId: string, dto: CreateAddressDto) {
    const address = await this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) {
        throw new AppError(409, "ADDRESS_LIMIT", `You can save up to ${MAX_ADDRESSES} addresses. Remove one to add another.`);
      }
      const isDefault = count === 0 || dto.isDefault === true;
      if (isDefault) await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      return tx.address.create({
        data: {
          userId,
          label: dto.label ?? "Home",
          name: dto.name,
          phone: dto.phone,
          line1: dto.line1,
          line2: dto.line2 ?? null,
          landmark: dto.landmark ?? null,
          city: dto.city,
          state: dto.state,
          pincode: dto.pincode,
          isDefault,
        },
      });
    });
    return toAddressView(address);
  }

  async update(userId: string, id: string, dto: UpdateAddressDto) {
    const address = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw notFound();
      // The default only moves by making another address the default.
      const { isDefault, ...fields } = dto;
      if (isDefault && !existing.isDefault) {
        await tx.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
      }
      return tx.address.update({
        where: { id },
        data: { ...fields, ...(isDefault && { isDefault: true }) },
      });
    });
    return toAddressView(address);
  }

  async remove(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.findFirst({ where: { id, userId } });
      if (!existing) throw notFound();
      await tx.address.delete({ where: { id } });
      if (existing.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }
}
