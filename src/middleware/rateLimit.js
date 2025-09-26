// ป้องกัน brute-force login แบบเบา ๆ (memory-based)
const attempts = new Map(); // key = ip, value = {count, ts}

export function limitLogin(req, res, next) {
  const ip = req.ip ?? req.headers['x-forwarded-for'] ?? req.connection.remoteAddress;
  const now = Date.now();
  const winMs = 5 * 60 * 1000; // 5 นาที
  const max = 20;

  const rec = attempts.get(ip) ?? { count: 0, ts: now };
  if (now - rec.ts > winMs) {
    attempts.set(ip, { count: 1, ts: now });
    return next();
  }
  if (rec.count >= max) {
    return res.status(429).json({ message: 'พยายามมากเกินไป กรุณาลองใหม่ภายหลัง' });
  }
  rec.count += 1;
  attempts.set(ip, rec);
  next();
}
