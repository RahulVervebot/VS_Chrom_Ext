// Tiny schema validator (no dependencies). Schema: { field: { type, required, enum, items, props } }
function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function validate(value, schema, at = '$') {
  const errors = [];
  const t = typeOf(value);
  if (schema.type && schema.type !== 'any' && t !== schema.type) {
    errors.push(`${at}: expected ${schema.type}, got ${t}`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${at}: must be one of ${schema.enum.join(', ')}`);
  }
  if (schema.type === 'string' && schema.pattern && !schema.pattern.test(value)) {
    errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if (schema.type === 'string' && schema.maxLength && value.length > schema.maxLength) {
    errors.push(`${at}: longer than ${schema.maxLength}`);
  }
  if (schema.type === 'array') {
    if (schema.maxItems && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.items) value.forEach((v, i) => errors.push(...validate(v, schema.items, `${at}[${i}]`)));
  }
  if (schema.type === 'object' && schema.props) {
    for (const [key, sub] of Object.entries(schema.props)) {
      if (value[key] === undefined) {
        if (sub.required) errors.push(`${at}.${key}: required`);
      } else {
        errors.push(...validate(value[key], sub, `${at}.${key}`));
      }
    }
  }
  return errors;
}

module.exports = { validate, typeOf };
