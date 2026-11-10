import { PartialType } from "@nestjs/mapped-types";
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import {
  EmptyToNull,
  INDIAN_STATES,
  MOBILE,
  MOBILE_MESSAGE,
  NormalizeMobile,
  NormalizeState,
  PINCODE,
  PINCODE_MESSAGE,
  Trim,
} from "../../users/validation.js";

export class CreateAddressDto {
  @IsOptional() @Trim() @IsString() @MinLength(1) @MaxLength(30, { message: "Use 30 characters or fewer." })
  label?: string;

  @Trim() @IsString() @MinLength(2, { message: "Enter your full name." }) @MaxLength(80, { message: "Use 80 characters or fewer." })
  name: string;

  @NormalizeMobile() @IsString({ message: MOBILE_MESSAGE }) @Matches(MOBILE, { message: MOBILE_MESSAGE })
  phone: string;

  @Trim()
  @IsString()
  @MinLength(8, { message: "Enter house number, street and area." })
  @MaxLength(200, { message: "Use 200 characters or fewer." })
  line1: string;

  @IsOptional() @EmptyToNull() @Trim() @IsString() @MaxLength(120, { message: "Use 120 characters or fewer." })
  line2?: string | null;

  @IsOptional() @EmptyToNull() @Trim() @IsString() @MaxLength(80, { message: "Use 80 characters or fewer." })
  landmark?: string | null;

  @Trim() @IsString() @MinLength(2, { message: "Enter your city or town." }) @MaxLength(60, { message: "Use 60 characters or fewer." })
  city: string;

  @NormalizeState() @IsIn(INDIAN_STATES, { message: "Choose your state from the list." })
  state: string;

  @Trim() @IsString({ message: PINCODE_MESSAGE }) @Matches(PINCODE, { message: PINCODE_MESSAGE })
  pincode: string;

  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
