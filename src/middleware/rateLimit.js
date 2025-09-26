const attempts = new Map();

export function limitLogin(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  
  if (!attempts.has(ip)) {
    attempts.set(ip, { count: 1, resetTime: now + windowMs });
    return next();
  }
  
  const record = attempts.get(ip);
  
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
    return next();
  }
  
  if (record.count >= 5) {
    return res.status(429).json({ error: 'Too many login attempts' });
  }
  
  record.count++;
  next();
}