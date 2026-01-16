const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const permissions = [
  { slug: 'pig.create', description: 'Can promote and register new pigs' },
  { slug: 'pig.view', description: 'Can view pig details' },
  { slug: 'pig.edit', description: 'Can edit pig details' },
  { slug: 'pig.delete', description: 'Can delete pigs' },
  { slug: 'finance.view', description: 'Can view financial data' },
  { slug: 'finance.manage', description: 'Can manage inventory and costs' },
  { slug: 'health.manage', description: 'Can manage health records' },
  { slug: 'admin.manage', description: 'Can manage farm settings and users' }
];

async function seedPermissions() {
  try {
    for (const perm of permissions) {
      await pool.query(
        'INSERT INTO permissions (slug, description) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING',
        [perm.slug, perm.description]
      );
      console.log('✅ Added permission:', perm.slug);
    }
    console.log('\n✨ Permissions seeded successfully!');
    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

seedPermissions();
