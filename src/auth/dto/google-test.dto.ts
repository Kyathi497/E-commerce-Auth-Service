import { IsEmail, MaxLength } from "class-validator";
import { NormalizeEmail } from "../../users/validation.js";

export class GoogleTestDto {
  @NormalizeEmail() @IsEmail({}, { message: "Enter an email address like name@gmail.com." }) @MaxLength(254)
  email: string;
}
