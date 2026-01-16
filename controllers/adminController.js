const db = require('../config/db');
const bcrypt = require('bcrypt');

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
    // First get all permissions
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
    if (error.code === '23505') { // Unique violation
        return res.status(400).json({ error: 'El email ya está registrado' });
    }
    res.status(500).json({ error: 'Error al crear la granja' });
  } finally {
    client.release();
  }
};

module.exports = { createFarm };
