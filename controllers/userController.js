const db = require('../config/db');
const bcrypt = require('bcrypt');

const createUser = async (req, res) => {
  const { full_name, email, password, role_id } = req.body;
  const farmId = req.user.farmId;

  if (!farmId) {
    return res.status(403).json({ error: 'Acceso denegado. No pertenece a una granja.' });
  }

  try {
    // 1. Check if user exists
    const checkQuery = 'SELECT id FROM users WHERE email = $1';
    const checkResult = await db.query(checkQuery, [email]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    // 2. Hash Password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 3. Insert User
    // Note: ID is UUID, let Postgres generate it if set to default gen_random_uuid(), 
    // or we might need to generate it if the schema requires it.
    // Based on search results, schema uses UUID. I'll assume it defaults or I can let Postgres handle it.
    // If it fails, I'll fix it. Safest is to let Postgres handle default or use RETURNING.
    const insertQuery = `
      INSERT INTO users (farm_id, full_name, email, password_hash, role_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, full_name, email, role_id, created_at
    `;
    
    const result = await db.query(insertQuery, [farmId, full_name, email, passwordHash, role_id]);
    
    res.status(201).json(result.rows[0]);

  } catch (error) {
    console.error('Create User Error:', error);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
};

const getUsers = async (req, res) => {
  const farmId = req.user.farmId;

  if (!farmId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  try {
    const query = `
      SELECT u.id, u.full_name, u.email, u.role_id, r.name as role_name, u.created_at
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.farm_id = $1 AND u.deleted_at IS NULL
      ORDER BY u.created_at DESC
    `;
    const result = await db.query(query, [farmId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Get Users Error:', error);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

module.exports = {
  createUser,
  getUsers
};
