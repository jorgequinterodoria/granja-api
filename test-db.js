const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function testDB() {
  try {
    // Test connection
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Database connected:', res.rows[0].now);

    // Check if tables exist
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('\n📋 Tables in database:');
    tables.rows.forEach(row => console.log('  -', row.table_name));

    // Check if SuperAdmin exists
    const users = await pool.query('SELECT email, farm_id FROM users');
    console.log('\n👤 Users in database:');
    users.rows.forEach(row => console.log('  -', row.email, '(farm_id:', row.farm_id, ')'));

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testDB();
