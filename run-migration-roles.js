const db = require('./config/db');
const fs = require('fs');
const path = require('path');

const runMigration = async () => {
  const client = await db.pool.connect();
  try {
    const sqlPath = path.join(__dirname, 'migrations', 'migration_roles_uuid.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('Running migration: migration_roles_uuid.sql');
    await client.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    client.release();
    process.exit();
  }
};

runMigration();
