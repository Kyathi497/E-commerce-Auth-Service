import { Transform } from "class-transformer";

// Same rules and wording as the storefront's checkout form.
export const MOBILE = /^[6-9]\d{9}$/;
export const PINCODE = /^[1-9]\d{5}$/;
export const EMAIL_MESSAGE = "Enter an email address like name@example.com.";
export const MOBILE_MESSAGE = "Enter a 10-digit Indian mobile number.";
export const PINCODE_MESSAGE = "Enter a 6-digit PIN code.";

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
] as const;

const byLowerName = new Map(INDIAN_STATES.map((s) => [s.toLowerCase(), s]));

// "+91 98480-12345" → "9848012345"
export function normalizeMobile(value: unknown) {
  return typeof value === "string" ? value.replace(/[\s-]/g, "").replace(/^(\+?91|0)(?=\d{10}$)/, "") : value;
}

// "andhra pradesh" → "Andhra Pradesh" (GST needs the exact state later).
export function normalizeState(value: unknown) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return byLowerName.get(trimmed.toLowerCase()) ?? trimmed;
}

export const normalizeEmail = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : value);

export const Trim = () => Transform(({ value }) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value));
export const NormalizeEmail = () => Transform(({ value }) => normalizeEmail(value));
export const NormalizeMobile = () => Transform(({ value }) => normalizeMobile(value));
export const NormalizeState = () => Transform(({ value }) => normalizeState(value));
// Empty strings from optional form fields become null (clears the value).
export const EmptyToNull = () => Transform(({ value }) => (typeof value === "string" && value.trim() === "" ? null : value));
