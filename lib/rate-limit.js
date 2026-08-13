const buckets = new Map();
const MAX_BUCKETS = 10000;

export function isRateLimited(key, limit, windowMs, now = Date.now()) {
  const timestamps = (buckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  if (timestamps.length >= limit) {
    buckets.set(key, timestamps);
    return true;
  }

  timestamps.push(now);
  buckets.delete(key);
  buckets.set(key, timestamps);
  if (buckets.size > MAX_BUCKETS) {
    buckets.delete(buckets.keys().next().value);
  }
  return false;
}
