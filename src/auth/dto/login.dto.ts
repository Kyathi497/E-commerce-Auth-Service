import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { NormalizeEmail } from "../../users/validation.js";

export class LoginDto {
  @NormalizeEmail() @IsEmail({}, { message: "Enter your email." }) @MaxLength(254, { message: "Enter your email." })
  email: string;

  @IsString() @MinLength(1, { message: "Enter your password." }) @MaxLength(200, { message: "Enter your password." })
  password: string;
}
