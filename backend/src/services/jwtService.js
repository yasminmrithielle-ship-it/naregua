import { createHmac, timingSafeEqual } from "crypto";
import { getJwtSecret } from "../config.js";

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signValue(value) {
  return createHmac("sha256", getJwtSecret()).update(value).digest("base64url");
}

export function signJwt(payload, options = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresInSeconds = Number(options.expiresInSeconds || 60 * 60 * 24 * 7);
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const body = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + expiresInSeconds
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(body));
  const signature = signValue(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwt(token) {
  const parts = String(token || "").split(".");

  if (parts.length !== 3) {
    throw new Error("Token JWT invalido.");
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = signValue(`${encodedHeader}.${encodedPayload}`);
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    throw new Error("Assinatura JWT invalida.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));

  if (!payload?.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Token JWT expirado.");
  }

  return payload;
}
