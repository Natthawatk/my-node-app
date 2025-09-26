export function validate(shape) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, rules] of Object.entries(shape)) {
      const value = req.body[field];
      
      if (rules.required && (!value || value.toString().trim() === '')) {
        errors.push(`${field} is required`);
        continue;
      }
      
      if (value && rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be ${rules.type}`);
      }
      
      if (value && rules.regex && !rules.regex.test(value)) {
        errors.push(`${field} format is invalid`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    next();
  };
}