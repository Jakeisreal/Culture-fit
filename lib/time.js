export function parseKSTDate(dateStr) {
  if (!dateStr) return null;
  const raw = String(dateStr).trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
  const normalized = raw.replace(' ', 'T');
  const withSeconds = /T\d{2}:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized;
  const date = new Date(hasTimezone ? withSeconds : `${withSeconds}+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}
export function validateTimeWindow(startAt, endAt, now = new Date()) {
  const start = parseKSTDate(startAt);
  const end = parseKSTDate(endAt);
  if (start && now < start) {
    return { valid: false, code: 'NOT_STARTED', message: '응시 시간이 아직 시작되지 않았습니다.' };
  }
  if (end && now > end) {
    return { valid: false, code: 'EXPIRED', message: '응시 가능 기간이 지났습니다.' };
  }
  return { valid: true };
}

export function parseElapsedSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value || '');
  if (/^\d+(\.\d+)?$/.test(text)) return Math.max(0, Number(text));
  const match = text.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
  if (!match) return 0;
  return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
}
