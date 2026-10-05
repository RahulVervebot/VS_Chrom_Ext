// Authentication/authorization evidence. Each hit is a syntactic match with file+line.
const { lineIndex, lineAt } = require('../utils/text');

const PATTERNS = [
  { kind: 'jwt', type: 'authentication', re: /\bjwt\.(sign|verify|decode)\s*\(|jsonwebtoken|JWT::|jwt\.encode|PyJWT|jwt_required|JwtAuthGuard/ },
  { kind: 'password-hashing', type: 'authentication', re: /\bbcrypt(?:js)?\b|argon2|password_hash\(|password_verify\(|make_password|check_password/ },
  { kind: 'passport', type: 'authentication', re: /passport\.(authenticate|use)\(|from\s+['"]passport/ },
  { kind: 'oauth', type: 'authentication', re: /oauth|OAuth2|GoogleAuthProvider|signInWithPopup|next-auth|NextAuth|openid/i },
  { kind: 'session', type: 'authentication', re: /express-session|req\.session|session\(\s*\{|\$_SESSION|session\[['"]/ },
  { kind: 'cookie', type: 'authentication', re: /cookie-parser|res\.cookie\(|document\.cookie|setcookie\(|set_cookie/i },
  { kind: 'login', type: 'authentication', re: /\b(?:login|signIn|signin|authenticate)\s*\(|signInWithEmailAndPassword|\/login\b/ },
  { kind: 'signup', type: 'authentication', re: /\b(?:signup|signUp|register|createUser)\s*\(|createUserWithEmailAndPassword|\/(?:signup|register)\b/ },
  { kind: 'auth-middleware', type: 'authorization', re: /\b(?:isAuthenticated|requireAuth|authMiddleware|ensureAuth\w*|verifyToken|authenticateToken|protect|auth)\b(?=\s*[,)])|@UseGuards\(|middleware\(\s*['"]auth|@login_required|login_required|permission_classes|@PreAuthorize|\[Authorize/ },
  { kind: 'role-check', type: 'authorization', re: /\b(?:hasRole|hasPermission|isAdmin|checkRole|requireRole|authorize|can)\s*\(|\.role\s*(?:===?|!==?)\s*['"]|roles?\.includes\(|@Roles\(|Gate::(?:allows|denies)|@permission_required/ },
  { kind: 'rbac', type: 'authorization', re: /\bRBAC\b|rbac|casbin|accesscontrol/i },
  { kind: 'protected-route', type: 'authorization', re: /ProtectedRoute|PrivateRoute|RequireAuth|useAuth\(\)|withAuth\(/ },
];

function analyzeAuth(content) {
  const starts = lineIndex(content);
  const out = [];
  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, p.re.flags.includes('i') ? 'gi' : 'g');
    let m;
    let count = 0;
    while ((m = re.exec(content)) && count < 5) {
      out.push({ kind: p.kind, type: p.type, line: lineAt(starts, m.index), match: m[0].slice(0, 40) });
      count++;
    }
  }
  return out;
}

module.exports = { analyzeAuth };
