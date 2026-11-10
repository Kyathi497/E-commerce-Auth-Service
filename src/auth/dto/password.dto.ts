import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { EMAIL_MESSAGE, NormalizeEmail } from "../../users/validation.js";

export class ForgotPasswordDto {
  @NormalizeEmail() @IsEmail({}, { message: EMAIL_MESSAGE }) @MaxLength(254, { message: EMAIL_MESSAGE })
  email: string;
}

export class ResetPasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) token: string;

  @IsString()
  @MinLength(8, { message: "Use at least 8 characters." })
  @MaxLength(200, { message: "Use 200 characters or fewer." })
  password: string;
}

export class VerifyEmailDto {
  @IsString() @MinLength(1) @MaxLength(128) token: string;
}
