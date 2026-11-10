import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from "class-validator";
import { EmptyToNull, MOBILE, MOBILE_MESSAGE, NormalizeMobile, Trim } from "../../users/validation.js";

export class UpdateMeDto {
  @IsOptional() @Trim() @IsString() @MinLength(2, { message: "Enter your name." }) @MaxLength(80, { message: "Use 80 characters or fewer." })
  name?: string;

  // null or "" removes the number.
  @IsOptional() @EmptyToNull() @NormalizeMobile() @ValidateIf((_, v) => v !== null) @Matches(MOBILE, { message: MOBILE_MESSAGE })
  phone?: string | null;

  @IsOptional() @IsBoolean() marketingOptIn?: boolean;
}

export class ChangePasswordDto {
  // Required when the account already has a password (Google-only accounts set their first one here).
  @IsOptional() @IsString() @MaxLength(200) currentPassword?: string;

  @IsString()
  @MinLength(8, { message: "Use at least 8 characters." })
  @MaxLength(200, { message: "Use 200 characters or fewer." })
  newPassword: string;
}

export class DeleteMeDto {
  // Required when the account has a password.
  @IsOptional() @IsString() @MaxLength(200) password?: string;
}
