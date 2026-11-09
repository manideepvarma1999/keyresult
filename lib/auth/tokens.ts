import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, safe for URLs and cookies. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only hashes of tokens are stored, so a database leak doesn't expose live sessions or invites. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
