const db = require('../config/db');
const bcrypt = require('bcrypt');

// Create Farm (moved from adminController for better organization)
const createFarm = async (req, res) => {
  const { farmName, adminEmail, adminPassword, plan } = req.body;
  
  if (!farmName || !adminEmail || !adminPassword) {
    return res.status(400).json({ error: 'Faltan datos requeridos (farmName, adminEmail, adminPassword)' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create Farm
    const farmRes = await client.query(
      'INSERT INTO farms (name, plan) VALUES ($1, $2) RETURNING id',
      [farmName, plan || 'Free']
    );
    const farmId = farmRes.rows[0].id;

    // 2. Create "Admin" Role for this Farm
    const roleRes = await client.query(
      'INSERT INTO roles (farm_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [farmId, 'Administrador', 'Control total de la granja']
    );
    const roleId = roleRes.rows[0].id;

    // 3. Assign All Global Permissions to this Role
    const allPermsRes = await client.query('SELECT id FROM permissions');
    for (const perm of allPermsRes.rows) {
      await client.query(
        'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
        [roleId, perm.id]
      );
    }

    // 4. Create Admin User
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    const userRes = await client.query(
      'INSERT INTO users (farm_id, email, password_hash, role_id, full_name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [farmId, adminEmail, hashedPassword, roleId, 'Administrador']
    );

    // 5. Default Sections (Optional but helpful)
    const defaults = ['Gestación', 'Maternidad', 'Destete', 'Ceba'];
    for (const name of defaults) {
      await client.query('INSERT INTO sections (farm_id, name) VALUES ($1, $2)', [farmId, name]);
    }

    await client.query('COMMIT');

    res.status(201).json({ 
      message: 'Granja creada exitosamente', 
      farmId, 
      adminId: userRes.rows[0].id 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create Farm Error:', error);
    if (error.code === '23505') {
        return res.status(400).json({ error: 'El email ya está registrado' });
    }
    res.status(500).json({ error: 'Error al crear la granja' });
  } finally {
    client.release();
  }
};

// List all farms
const listFarms = async (req, res) => {
  try {
    // Get all farms with user counts and admin email
    const query = `
      SELECT 
        f.id, 
        f.name, 
        f.plan, 
        f.created_at,
        COUNT(DISTINCT u.id) as user_count,
        (
            SELECT u2.email 
            FROM users u2 
            JOIN roles r ON u2.role_id = r.id 
            WHERE u2.farm_id = f.id AND r.name = 'Administrador' 
            LIMIT 1
        ) as admin_email
      FROM farms f
      LEFT JOIN users u ON f.id = u.farm_id AND u.deleted_at IS NULL
      WHERE f.deleted_at IS NULL
      GROUP BY f.id, f.name, f.plan, f.created_at
      ORDER BY f.created_at DESC
    `;
    
    const result = await db.query(query);

    res.json({ farms: result.rows });
  } catch (error) {
    console.error('List Farms Error:', error);
    res.status(500).json({ error: 'Error al listar granjas' });
  }
};

// Update Farm Plan
const updatePlan = async (req, res) => {
    const { id } = req.params;
    const { plan } = req.body;

    if (!['Free', 'Pro'].includes(plan)) {
        return res.status(400).json({ error: 'Plan inválido' });
    }

    try {
        await db.query('UPDATE farms SET plan = $1 WHERE id = $2', [plan, id]);
        res.json({ message: 'Plan actualizado correctamente' });
    } catch (error) {
        console.error('Update Plan Error:', error);
        res.status(500).json({ error: 'Error al actualizar el plan' });
    }
};

// Reset Admin Password
const resetAdminPassword = async (req, res) => {
    const { id } = req.params; // farmId
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    try {
        // Find the admin user for this farm
        const adminRes = await db.query(`
            SELECT u.id 
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.farm_id = $1 AND r.name = 'Administrador'
            LIMIT 1
        `, [id]);

        if (adminRes.rows.length === 0) {
            return res.status(404).json({ error: 'No se encontró un usuario administrador para esta granja' });
        }

        const adminId = adminRes.rows[0].id;
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashedPassword, adminId]);

        res.json({ message: 'Contraseña del administrador actualizada correctamente' });

    } catch (error) {
        console.error('Reset Admin Password Error:', error);
        res.status(500).json({ error: 'Error al restablecer la contraseña' });
    }
};

module.exports = { createFarm, listFarms, updatePlan, resetAdminPassword };


