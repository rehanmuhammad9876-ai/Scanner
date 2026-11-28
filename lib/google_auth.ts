
import { NextRequest } from 'next/server';
import { createDecipheriv } from 'crypto';

export interface GoogleSession {
  sub: string;
  email: string;
  exp: number;
}

export function getGoogleSession(
  request: NextRequest
): GoogleSession | null {
  try {
    const cookie = request.cookies.get('pls_google_session')?.value;
    const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;

    if (!cookie || !encryptionKey) return null;

    const key = Buffer.from(encryptionKey, 'hex');

    if (key.length !== 32) return null;

    const parts = cookie.split('.');

    if (parts.length !== 3) return null;

    const [ivText, tagText, encryptedText] = parts;

    const iv = Buffer.from(ivText, 'base64url');
    const tag = Buffer.from(tagText, 'base64url');
    const encrypted = Buffer.from(encryptedText, 'base64url');

    if (iv.length !== 12 || tag.length !== 16) return null;

    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      iv
    );

    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');

    const session = JSON.parse(decrypted) as GoogleSession;

    if (
      !session.sub ||
      !session.email ||
      !Number.isFinite(session.exp) ||
      session.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}
