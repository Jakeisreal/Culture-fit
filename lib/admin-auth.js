import crypto from 'crypto';

export function isAdminRequest(req) {
  const expected = process.env.DIAGNOSTICS_TOKEN;
  if (!expected) return false;

  const authorization = String(req?.headers?.authorization || '');
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export function requireAdmin(req, res) {
  if (isAdminRequest(req)) return true;
  res.status(401).json({ ok: false, message: '관리자 인증이 필요합니다.' });
  return false;
}
