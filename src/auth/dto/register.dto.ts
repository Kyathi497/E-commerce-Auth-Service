import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { EMAIL_MESSAGE, NormalizeEmail, Trim } from "../../users/validation.js";

export class RegisterDto {
  @Trim() @IsString() @MinLength(2, { message: "Enter your name." }) @MaxLength(80, { message: "Use 80 characters or fewer." })
  name: string;

  @NormalizeEmail() @IsEmail({}, { message: EMAIL_MESSAGE }) @MaxLength(254, { message: EMAIL_MESSAGE })
  email: string;

  @IsString()
  @MinLength(8, { message: "Use at least 8 characters." })
  @MaxLength(200, { message: "Use 200 characters or fewer." })
  password: string;
}
