// ตัวอย่าง validator แบบง่าย ๆ
export const validate =
  (shape) => (req, res, next) => {
    const data = req.method === 'GET' ? req.query : req.body;
    console.log('Validation data:', data);
    console.log('Validation shape:', shape);
    const errors = [];
    for (const [key, rule] of Object.entries(shape)) {
      const v = data[key];
      if (rule.required && (v === undefined || v === null || v === '')) {
        errors.push(`${key} is required`);
        continue;
      }
      if (v && rule.type && typeof v !== rule.type) {
        errors.push(`${key} must be ${rule.type}`);
      }
      if (v && rule.regex && !rule.regex.test(v)) {
        errors.push(`${key} format invalid`);
      }
    }
    if (errors.length) return res.status(400).json({ message: 'Validation error', errors });
    return next();
  };
