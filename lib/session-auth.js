import crypto from 'crypto';

export const SESSION_COOKIE_NAME = 'cf_session';
const SESSION_TTL_SECONDS = 6 * 60 * 60;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== 'production') return 'culture-fit-local-development-secret';
  throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다.');
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

export function createSessionToken(sessionId, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    sid: String(sessionId),
    exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token, expectedSessionId, now = Date.now()) {
  if (!token || !expectedSessionId) return false;
  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra) return false;

  const expectedSignature = sign(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed.sid === String(expectedSessionId) && parsed.exp >= Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function getCookie(req, name) {
  const cookies = String(req?.headers?.cookie || '').split(';');
  for (const cookie of cookies) {
    const separator = cookie.indexOf('=');
    if (separator < 0) continue;
    const key = cookie.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(cookie.slice(separator + 1).trim());
  }
  return null;
}

export function hasValidSession(req, sessionId) {
  return verifySessionToken(getCookie(req, SESSION_COOKIE_NAME), sessionId);
}

export function setSessionCookie(res, sessionId) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const token = createSessionToken(sessionId);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  );
}
