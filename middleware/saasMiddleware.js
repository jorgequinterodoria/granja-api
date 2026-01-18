const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Middleware to authenticate Token & Inject Tenant Context
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    
    // TENANT ISOLATION: Simply trusting the token for farmId is efficient, 
    // but ensures every subsequent query uses req.farmId
    req.farmId = decoded.farmId; 
    const isUUID = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

    // Allow SuperAdmin to bypass tenant context check
    const permissions = decoded.permissions || [];
    const isSuperAdmin = permissions.includes('admin.*') || permissions.includes('admin.manage');

    // Only enforce tenant context if NOT superadmin
    if (!isSuperAdmin && (!req.farmId || !isUUID(req.farmId))) {
      const result = await db.query('SELECT farm_id FROM users WHERE id = $1 AND deleted_at IS NULL', [req.user.id]);
      if (result.rows.length === 0 || !result.rows[0].farm_id) {
        return res.status(403).json({ error: 'Invalid tenant context' });
      }
      req.farmId = result.rows[0].farm_id;
    }

    // Optional: Double check if user still exists or is active if strictly needed
    // const result = await db.query('SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL', [req.user.id]);
    // if (result.rows.length === 0) return res.status(403).json({ error: 'User invalid' });

    next();
  } catch (error) {
    console.error('Auth Error:', error);
    return res.status(403).json({ error: 'Invalid token.' });
  }
};

// Middleware for RBAC
const requirePermission = (permissionSlug) => {
  return async (req, res, next) => {
    try {
      const { roleId } = req.user;
      
      // Optimization: You might want to cache permissions in the JWT to avoid DB hit on every request.
      // But for robust implementation, we check DB or assume permissions were verified at login.
      // FOR THIS SaaS: We will check the permissions array sent in the JWT or query DB.
      // Strategy 1: JWT contains permissions (Stateless & Fast) - Let's use this as per prompt "Login returns permissions"
      
      const userPermissions = req.user.permissions || [];
      
      // Allow SuperAdmin bypass if needed (or just ensure SuperAdmin has all permissions)
      if (userPermissions.includes('admin.*') || userPermissions.includes(permissionSlug)) {
        next();
      } else {
        return res.status(403).json({ error: `Forbidden. Requires permission: ${permissionSlug}` });
      }
    } catch (error) {
      console.error('RBAC Error:', error);
      res.status(500).json({ error: 'Server error checking permissions.' });
    }
  };
};

module.exports = { authenticateToken, requirePermission };
