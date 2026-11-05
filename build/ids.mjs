import { createHash } from "node:crypto";

export const MODULE_ID = "ship-stats-card";

/** Stable 16-character alphanumeric document ids, so rebuilding a pack never changes them. */
export const id = (seed) => createHash("sha1").update(seed).digest("hex").slice(0, 16);
