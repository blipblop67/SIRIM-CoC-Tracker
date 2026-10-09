import type { Request, Response, NextFunction } from "express";
import { google } from "googleapis";
import firebaseConfig from "./firebase-applet-config.json";

/**
 * Server-side login check for every /api route.
 *
 * The browser sends the signed-in user's Firebase ID token in the `X-Firebase-Token` header
 * (added automatically by src/utils/apiAuthFetch.ts). Firebase refreshes that token on its own,
 * so people stay signed in to the tracker even after the 1-hour Gmail token expires.
 * The `Authorization: Bearer` header stays reserved for the Google (Gmail/Sheets) access token.
 *
 * Who may use the tracker:
 *   ALLOWED_EMAIL_DOMAINS  comma-separated, default "cytron.io"
 *   ALLOWED_EMAILS         optional comma-separated extra addresses (e.g. a personal Gmail)
 */

const PROJECT_ID: string = (firebaseConfig as any).projectId;
const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || "cytron.io")
  .split(",")
  .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);
const allowedEmails = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAllowedEmail(email?: string | null): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (allowedEmails.includes(e)) return true;
  const domain = e.split("@")[1] || "";
  return allowedDomains.includes(domain);
}

const verifier = new google.auth.OAuth2();
let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebaseCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() < certCache.expiresAt) return certCache.certs;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`Could not fetch Firebase signing certs (HTTP ${res.status})`);
  const certs = (await res.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  certCache = { certs, expiresAt: Date.now() + maxAge * 1000 };
  return certs;
}

export interface AuthedUser {
  uid: string;
  email: string;
  name?: string;
}

/** Verifies a Firebase ID token and returns the user, or throws. */
export async function verifyFirebaseIdToken(idToken: string): Promise<AuthedUser> {
  const certs = await getFirebaseCerts();
  const ticket = await verifier.verifySignedJwtWithCertsAsync(
    idToken,
    certs,
    PROJECT_ID,
    [`https://securetoken.google.com/${PROJECT_ID}`]
  );
  const p: any = ticket.getPayload() || {};
  if (!p.sub) throw new Error("Token has no subject");
  if (!p.email || p.email_verified !== true) throw new Error("Token has no verified email");
  return { uid: p.sub, email: String(p.email).toLowerCase(), name: p.name };
}

/** Looks up which Google account a Gmail/Sheets access token belongs to. */
export async function getAccessTokenEmail(accessToken: string): Promise<string | null> {
  try {
    const info = await verifier.getTokenInfo(accessToken);
    return info.email ? info.email.toLowerCase() : null;
  } catch {
    return null;
  }
}

// Routes that must work without signing in.
const PUBLIC_API_PATHS = new Set(["/api/health"]);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/** Express middleware: rejects any /api request without a valid, allowed sign-in. */
export async function requireApiAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith("/api/") || PUBLIC_API_PATHS.has(req.path)) return next();

  const idToken = req.header("x-firebase-token");
  if (!idToken) {
    return res.status(401).json({ error: "Sign in required", code: "AUTH_REQUIRED" });
  }
  try {
    const user = await verifyFirebaseIdToken(idToken);
    if (!isAllowedEmail(user.email)) {
      return res.status(403).json({
        error: `${user.email} is not allowed to use this tracker. Sign in with your Cytron account.`,
        code: "AUTH_FORBIDDEN",
      });
    }
    req.user = user;
    return next();
  } catch (err: any) {
    return res.status(401).json({ error: "Sign-in expired or invalid. Please sign in again.", code: "AUTH_REQUIRED" });
  }
}
