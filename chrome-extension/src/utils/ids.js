export function randomId(prefix, bytes = 6) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return `${prefix}-${[...a].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}
