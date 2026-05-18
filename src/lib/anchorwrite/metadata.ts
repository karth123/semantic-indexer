import type { AnchorData } from "./types";

export const METADATA_PREFIX = "ANCHORWRITE::v1::";

export function encodeMetadata(data: AnchorData): string {
  const json = JSON.stringify(data);
  // base64 encode to keep it compact and safe for PDF metadata
  const b64 = typeof window !== "undefined"
    ? btoa(unescape(encodeURIComponent(json)))
    : Buffer.from(json, "utf-8").toString("base64");
  return METADATA_PREFIX + b64;
}

export function decodeMetadata(raw: string | undefined | null): AnchorData | null {
  if (!raw) return null;
  const idx = raw.indexOf(METADATA_PREFIX);
  if (idx === -1) return null;
  const b64 = raw.slice(idx + METADATA_PREFIX.length).trim();
  try {
    const json = typeof window !== "undefined"
      ? decodeURIComponent(escape(atob(b64)))
      : Buffer.from(b64, "base64").toString("utf-8");
    const parsed = JSON.parse(json);
    if (parsed && parsed.version === 1) return parsed as AnchorData;
    return null;
  } catch {
    return null;
  }
}
