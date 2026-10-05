// Business-rule candidates. These are INFERRED from naming and structure, never VERIFIED as intent.
const RULES = [
  { kind: 'validation', re: /^(validate|verify|check|is(?:Valid|Eligible|Allowed)|assert|ensure|sanitize)/i },
  { kind: 'calculation', re: /^(calculate|compute|apply(?:Discount|Tax|Coupon)|get(?:Total|Price|Tax|Discount)|total|subtotal|discount|tax|round)/i },
  { kind: 'permission-check', re: /(permission|authorize|canAccess|hasRole|isAdmin|canEdit|canDelete)/i },
  { kind: 'stock-check', re: /(stock|inventory|availability|isAvailable)/i },
  { kind: 'status-transition', re: /(status|transition|advance|approve|reject|cancel|complete|fulfill|refund)/i },
  { kind: 'eligibility', re: /(eligib|qualif|limit|quota|threshold)/i },
  { kind: 'payment-rule', re: /(payment|charge|invoice|billing|subscription|checkout)/i },
];

function analyzeBusinessLogic(symbols, isTest) {
  if (isTest) return [];
  const out = [];
  for (const s of symbols) {
    if (!['function', 'method'].includes(s.type)) continue;
    for (const r of RULES) {
      if (r.re.test(s.name)) { out.push({ symbol: s.name, kind: r.kind, line: s.line, endLine: s.endLine, status: 'INFERRED', basis: 'symbol name' }); break; }
    }
  }
  return out;
}

module.exports = { analyzeBusinessLogic };
