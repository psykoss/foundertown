import { RAMP_NAMES } from "./art";
import type { RampSelection } from "./art";

export interface AvatarConfig {
  body: string;
  hair: string;
  top: string;
  bottom: string;
  shoes: string;
  /** Null means the avatar wears no accessory. */
  accessory: string | null;
  /** The ramp used to fill each group of colour slots. */
  colors: RampSelection;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  body: "default",
  hair: "short",
  top: "t-shirt",
  bottom: "jeans",
  shoes: "sneakers",
  accessory: null,
  colors: {
    hair: "brown",
    top: "teal",
    skin: "light",
    bottom: "denim",
    shoes: "white",
    accessory: "silver",
  },
};

const REQUIRED_PARTS = ["body", "hair", "top", "bottom", "shoes"] as const;

/** Checks untrusted data, such as a network message or saved profile. */
export function isAvatarConfig(value: unknown): value is AvatarConfig {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  const hasRequiredParts = REQUIRED_PARTS.every((part) => {
    const id = candidate[part];
    return typeof id === "string" && id.length > 0;
  });
  const accessory = candidate["accessory"];
  const colors = candidate["colors"];
  const hasColors =
    typeof colors === "object" &&
    colors !== null &&
    RAMP_NAMES.every((ramp) => {
      const name = (colors as Record<string, unknown>)[ramp];
      return typeof name === "string" && name.length > 0;
    });
  return (
    hasRequiredParts &&
    hasColors &&
    (accessory === null ||
      (typeof accessory === "string" && accessory.length > 0))
  );
}
