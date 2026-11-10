import { describe, expect, it } from "vitest";
import { MOBILE, normalizeEmail, normalizeMobile, normalizeState, PINCODE } from "./validation.js";

describe("normalizeMobile", () => {
  it.each([
    ["+91 98480 12345", "9848012345"],
    ["91-9848012345", "9848012345"],
    ["09848012345", "9848012345"],
    ["9848012345", "9848012345"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeMobile(input)).toBe(expected);
    expect(MOBILE.test(expected)).toBe(true);
  });

  it("leaves numbers it can't read for validation to reject", () => {
    expect(MOBILE.test(normalizeMobile("12345") as string)).toBe(false);
    expect(MOBILE.test(normalizeMobile("5848012345") as string)).toBe(false);
  });
});

describe("normalizeState", () => {
  it("maps any casing and spacing to the canonical name", () => {
    expect(normalizeState("  andhra   PRADESH ")).toBe("Andhra Pradesh");
    expect(normalizeState("telangana")).toBe("Telangana");
  });

  it("returns unknown states unchanged so validation can name the field", () => {
    expect(normalizeState("Atlantis")).toBe("Atlantis");
  });
});

it("normalizeEmail trims and lowercases", () => {
  expect(normalizeEmail("  Lakshmi@Example.COM ")).toBe("lakshmi@example.com");
});

it("PINCODE accepts 6 digits not starting with 0", () => {
  expect(PINCODE.test("520003")).toBe(true);
  expect(PINCODE.test("020003")).toBe(false);
  expect(PINCODE.test("52003")).toBe(false);
});
