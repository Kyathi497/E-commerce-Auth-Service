import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Trim } from "../../users/validation.js";

export class ListUsersQuery {
  // Matches name, email or phone.
  @IsOptional() @Trim() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(["user", "admin"]) role?: "user" | "admin";
  @IsOptional() @IsIn(["active", "locked", "deleted"]) status?: "active" | "locked" | "deleted";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsIn(["user", "admin"]) role?: "user" | "admin";
  // Locking also signs the user out everywhere.
  @IsOptional() @IsIn(["active", "locked"]) status?: "active" | "locked";
  // Makes a role change apply now instead of at the next token refresh.
  @IsOptional() @IsBoolean() revokeSessions?: boolean;
}
