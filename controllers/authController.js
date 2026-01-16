const db = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Fetch User & Farm Info
    const userQuery = `
      SELECT u.id, u.email, u.password_hash, u.farm_id, u.role_id, f.plan
      FROM users u
      LEFT JOIN farms f ON u.farm_id = f.id
      WHERE u.email = $1 AND u.deleted_at IS NULL
    `;
    const userResult = await db.query(userQuery, [email]);
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = userResult.rows[0];

    // 2. Check Password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // 3. Fetch Permissions
    let permissions = [];
    
    // SuperAdmin Logic: If farm_id is NULL, they are SuperAdmin
    if (!user.farm_id) {
        permissions = ['admin.manage', 'admin.*']; // Grant all admin permissions
    } else {
        // Normal Tenant User
        const permQuery = `
          SELECT p.slug 
          FROM permissions p
          JOIN role_permissions rp ON p.id = rp.permission_id
          WHERE rp.role_id = $1
        `;
        const permResult = await db.query(permQuery, [user.role_id]);
        permissions = permResult.rows.map(r => r.slug);
    }

    // 4. Generate Token (Payload includes critical tenant info)
    const token = jwt.sign(
      { 
        id: user.id, 
        farmId: user.farm_id, 
        roleId: user.role_id,
        plan: user.plan,
        permissions: permissions // Embed permissions for efficient RBAC middleware
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' } // Long session for mobile app
    );

    // 5. Response
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        farmId: user.farm_id,
        full_name: user.full_name,
      },
      permissions
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

module.exports = { login };
