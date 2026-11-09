import { describe, expect, it } from "vitest";
import { DEFAULT_AVATAR, TILE, isAvatarConfig } from "../src/index";

describe("constants", () => {
  it("uses 32px tiles", () => {
    expect(TILE).toBe(32);
  });
});

describe("isAvatarConfig", () => {
  it("accepts the default avatar", () => {
    expect(isAvatarConfig(DEFAULT_AVATAR)).toBe(true);
  });

  it("accepts an avatar with an accessory", () => {
    expect(isAvatarConfig({ ...DEFAULT_AVATAR, accessory: "glasses" })).toBe(
      true,
    );
  });

  it.each([
    ["null", null],
    ["a string", "avatar"],
    ["a missing part", { ...DEFAULT_AVATAR, hair: undefined }],
    ["an empty part", { ...DEFAULT_AVATAR, shoes: "" }],
    ["missing colours", { ...DEFAULT_AVATAR, colors: undefined }],
    [
      "an incomplete colour set",
      { ...DEFAULT_AVATAR, colors: { hair: "brown" } },
    ],
    ["a missing accessory key", { ...DEFAULT_AVATAR, accessory: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isAvatarConfig(value)).toBe(false);
  });
});
