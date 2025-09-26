// Session-based auth helpers
export function requireAuth(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ message: 'ต้องเข้าสู่ระบบ' });
  return next();
}

export function optionalAuth(req, _res, next) {
  // ไม่มี user ก็แค่ผ่านไป
  return next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ message: 'ต้องเข้าสู่ระบบ' });
    if (req.session.user.role !== role) return res.status(403).json({ message: 'สิทธิ์ไม่พอ' });
    next();
  };
}

export function requireAnyRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ message: 'ต้องเข้าสู่ระบบ' });
    if (!roles.includes(req.session.user.role)) return res.status(403).json({ message: 'สิทธิ์ไม่พอ' });
    next();
  };
}
