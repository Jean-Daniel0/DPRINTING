import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

export function hashPassword(password: string, salt = crypto.randomBytes(16)): string {
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  try {
    const [scheme, n, r, p, saltB64, hashB64] = encoded.split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const ADMIN_COOKIE = 'dp_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

type SessionPayload = { sub: 'admin'; exp: number; email: string };

const b64url = (b: Buffer): string => b.toString('base64url');

export function signSession(secret: string, email: string, now = Date.now()): string {
  const payload: SessionPayload = { sub: 'admin', email, exp: now + SESSION_TTL_MS };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function readSession(secret: string, token: string | undefined, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (payload.sub !== 'admin' || !Number.isFinite(payload.exp) || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`);
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

export type AdminGuard = (req: Request, res: Response, next: NextFunction) => void;

export function adminGuard(secret: string): AdminGuard {
  return (req, res, next) => {
    const payload = readSession(secret, parseCookies(req.headers.cookie)[ADMIN_COOKIE]);
    if (!payload) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Connexion administrateur requise.' } }); return; }
    (req as Request & { admin?: SessionPayload }).admin = payload;
    next();
  };
}

/** Limiteur en mémoire, suffisant pour un service mono-instance (Render). */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Trop de requêtes, réessayez dans une minute.' } });
      return;
    }
    next();
  };
}
