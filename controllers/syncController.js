
const db = require('../config/db');

const sync = async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { changes, lastPulledAt } = req.body;
    const farmId = req.user.farmId || req.user.farm_id; // Ensure we get the farm ID

    if (!farmId) {
        throw new Error("Farm ID is missing from user context");
    }

    await client.query('BEGIN');

    // --- Helper Functions (Closure over client & farmId) ---

    const isValidUUID = (id) => {
        return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    };

    const upsertPigs = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          
          let pigId = r.id;

          // Validate UUID
          if (!isValidUUID(pigId)) {
              console.warn(`Invalid UUID for pig: ${pigId}. Attempting recovery by tag_number...`);
              // Try to find by tag_number to recover the real UUID
              if (r.tag_number || r.numero_arete) {
                  const tag = r.tag_number || r.numero_arete;
                  const found = await client.query(
                      'SELECT id FROM pigs WHERE farm_id = $1 AND (tag_number = $2 OR numero_arete = $2)', 
                      [farmId, tag]
                  );
                  if (found.rows.length > 0) {
                      pigId = found.rows[0].id;
                      console.log(`Recovered UUID for pig ${tag}: ${pigId}`);
                  } else {
                      console.error(`Skipping pig with invalid ID ${pigId} and tag ${tag} (not found on server)`);
                      continue; // Skip to prevent 500 Error
                  }
              } else {
                  console.error(`Skipping pig with invalid ID ${pigId} (no tag to recover)`);
                  continue;
              }
          }
          
          const q = `
            INSERT INTO pigs (
                id, farm_id, pen_id, tag_number, sex, stage, birth_date, weight, status, 
                created_at, updated_at, deleted_at, entry_date,
                father_id, mother_id, genetics_score
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'Activo'), $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (id) DO UPDATE SET
              pen_id = EXCLUDED.pen_id,
              tag_number = EXCLUDED.tag_number,
              sex = EXCLUDED.sex,
              stage = EXCLUDED.stage,
              birth_date = EXCLUDED.birth_date,
              weight = EXCLUDED.weight,
              status = EXCLUDED.status,
              updated_at = EXCLUDED.updated_at,
              deleted_at = EXCLUDED.deleted_at,
              entry_date = EXCLUDED.entry_date,
              father_id = EXCLUDED.father_id,
              mother_id = EXCLUDED.mother_id,
              genetics_score = EXCLUDED.genetics_score
          `;
          
          await client.query(q, [
            pigId, 
            farmId, 
            (r.pen_id && isValidUUID(r.pen_id)) ? r.pen_id : null, // Only pass valid UUIDs for pen_id to avoid schema mismatch
            r.tag_number, 
            r.sex, 
            r.stage, 
            (r.birth_date && r.birth_date !== '') ? r.birth_date : null,
            r.weight,
            r.status, 
            r.created_at || null, 
            r.updated_at || new Date().toISOString(), 
            r.deleted_at || null,
            (r.entry_date && r.entry_date !== '') ? r.entry_date : null,
            r.father_id || null,
            r.mother_id || null,
            r.genetics_score || null
          ]);
        }
    };

    const upsertWeightLogs = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          const q = `
            INSERT INTO weight_logs (id, farm_id, pig_id, weight, date, created_at, deleted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
              pig_id = EXCLUDED.pig_id,
              weight = EXCLUDED.weight,
              date = EXCLUDED.date,
              deleted_at = EXCLUDED.deleted_at
          `;
          await client.query(q, [
            r.id, farmId, r.pig_id, r.weight, r.date, r.created_at || new Date().toISOString(), r.deleted_at || null
          ]);
        }
    };

    const upsertBreedingEvents = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          const q = `
            INSERT INTO breeding_events (id, farm_id, pig_id, event_type, date, details, created_at, deleted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (id) DO UPDATE SET
              pig_id = EXCLUDED.pig_id,
              event_type = EXCLUDED.event_type,
              date = EXCLUDED.date,
              details = EXCLUDED.details,
              deleted_at = EXCLUDED.deleted_at
          `;
          await client.query(q, [
            r.id, farmId, r.pig_id, r.event_type, r.date, r.details || null, r.created_at || new Date().toISOString(), r.deleted_at || null
          ]);
        }
    };

    const upsertHealthEvents = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          const q = `
            INSERT INTO health_events (
                id, farm_id, pig_id, type, description, date, cost, created_at, deleted_at,
                medication_id, withdrawal_end_date
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
              pig_id = EXCLUDED.pig_id,
              type = EXCLUDED.type,
              description = EXCLUDED.description,
              date = EXCLUDED.date,
              cost = EXCLUDED.cost,
              deleted_at = EXCLUDED.deleted_at,
              medication_id = EXCLUDED.medication_id,
              withdrawal_end_date = EXCLUDED.withdrawal_end_date
          `;
          await client.query(q, [
            r.id, 
            farmId, 
            r.pig_id, 
            r.type, 
            r.description || null, 
            r.date, 
            r.cost || 0, 
            r.created_at || new Date().toISOString(), 
            r.deleted_at || null,
            r.medication_id || null,
            r.withdrawal_end_date || null
          ]);
        }
    };

    const upsertMedications = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          const q = `
            INSERT INTO medications (id, farm_id, name, withdrawal_days, created_at, updated_at, deleted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              withdrawal_days = EXCLUDED.withdrawal_days,
              updated_at = EXCLUDED.updated_at,
              deleted_at = EXCLUDED.deleted_at
          `;
          await client.query(q, [
            r.id, farmId, r.name, r.withdrawal_days || 0, r.created_at || null, r.updated_at || new Date().toISOString(), r.deleted_at || null
          ]);
        }
    };

    const upsertFeedInventory = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          const q = `
            INSERT INTO feed_inventory (id, farm_id, name, cost_per_kg, current_stock, batch_code, created_at, updated_at, deleted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              cost_per_kg = EXCLUDED.cost_per_kg,
              current_stock = EXCLUDED.current_stock,
              batch_code = EXCLUDED.batch_code,
              updated_at = EXCLUDED.updated_at,
              deleted_at = EXCLUDED.deleted_at
          `;
          await client.query(q, [
            r.id, farmId, r.name, r.cost_per_kg, r.current_stock, r.batch_code || null, r.created_at || null, r.updated_at || new Date().toISOString(), r.deleted_at || null
          ]);
        }
    };

    const upsertFeedUsage = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          const q = `
            INSERT INTO feed_usage (id, farm_id, feed_id, pen_id, pig_id, amount_kg, date, created_at, deleted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              feed_id = EXCLUDED.feed_id,
              pen_id = EXCLUDED.pen_id,
              pig_id = EXCLUDED.pig_id,
              amount_kg = EXCLUDED.amount_kg,
              date = EXCLUDED.date,
              deleted_at = EXCLUDED.deleted_at
          `;
          await client.query(q, [
            r.id, farmId, r.feed_id, r.pen_id, r.pig_id, r.amount_kg, r.date, r.created_at || new Date().toISOString(), r.deleted_at || null
          ]);
        }
    };

    const upsertSections = async (rows) => {
        for (const r of rows) {
          if (!r) continue;
          const isNumericId = typeof r.id === 'number' || (typeof r.id === 'string' && /^\d+$/.test(r.id));
          if (isNumericId && r.id) {
            const q = `
              INSERT INTO sections (id, farm_id, name, created_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5)
              ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                deleted_at = EXCLUDED.deleted_at
            `;
            await client.query(q, [
              parseInt(r.id), farmId, r.name, r.created_at || new Date().toISOString(), r.deleted_at || null
            ]);
          } else {
            const found = await client.query(
              `SELECT id FROM sections WHERE farm_id = $1 AND name = $2`,
              [farmId, r.name]
            );
            if (found.rows.length > 0) {
              await client.query(
                `UPDATE sections SET deleted_at = $3 WHERE id = $1 AND farm_id = $2`,
                [found.rows[0].id, farmId, r.deleted_at || null]
              );
            } else {
              await client.query(
                `INSERT INTO sections (farm_id, name, created_at, deleted_at) VALUES ($1, $2, $3, $4)`,
                [farmId, r.name, r.created_at || new Date().toISOString(), r.deleted_at || null]
              );
            }
          }
        }
    };

    // Helper to resolve Section for Pens
    const resolveSection = async (secId, secName) => {
        if (secId && (typeof secId === 'number' || /^\d+$/.test(secId))) return { id: parseInt(secId) };
        if (secName) {
             const found = await client.query('SELECT id FROM sections WHERE farm_id = $1 AND name = $2', [farmId, secName]);
             if (found.rows.length > 0) return { id: found.rows[0].id };
        }
        return { id: null };
    };

    const upsertPens = async (rows) => {
        for (const r of rows) {
          if (!r) continue;
          const isNumericId = typeof r.id === 'number' || (typeof r.id === 'string' && /^\d+$/.test(r.id));
          
          const rawSec = r.section_id ?? r.sectionId;
          const rawName = r.section_name ?? r.sectionName;
          
          const { id: secId } = await resolveSection(rawSec, rawName);
          
          if (!secId) {
             console.warn('Could not resolve section for pen', r);
             // We can't insert a pen without a section if schema requires it, or we insert null
             // Proceeding if schema allows null, otherwise this might fail.
          }

          if (isNumericId && r.id) {
            const q = `
              INSERT INTO pens (id, farm_id, section_id, name, capacity, created_at, deleted_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              ON CONFLICT (id) DO UPDATE SET
                section_id = EXCLUDED.section_id,
                name = EXCLUDED.name,
                capacity = EXCLUDED.capacity,
                deleted_at = EXCLUDED.deleted_at
            `;
            await client.query(q, [
              parseInt(r.id), farmId, secId, r.name, r.capacity || 0, r.created_at || new Date().toISOString(), r.deleted_at || null
            ]);
          } else {
            const found = await client.query(
              `SELECT id FROM pens WHERE farm_id = $1 AND name = $2`,
              [farmId, r.name]
            );
            if (found.rows.length > 0) {
              await client.query(
                `UPDATE pens SET section_id = $3, capacity = $4, deleted_at = $5 WHERE id = $1 AND farm_id = $2`,
                [found.rows[0].id, farmId, secId, r.capacity || 0, r.deleted_at || null]
              );
            } else {
              await client.query(
                `INSERT INTO pens (farm_id, section_id, name, capacity, created_at) VALUES ($1, $2, $3, $4, $5)`,
                [farmId, secId, r.name, r.capacity || 0, r.created_at || new Date().toISOString()]
              );
            }
          }
        }
    };

    const upsertAccessLogs = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          const q = `
            INSERT INTO access_logs (id, farm_id, visitor_name, origin, is_safe_origin, entry_time, created_at)
            VALUES ($1, $2, $3, $4, COALESCE($5,false), COALESCE($6, NOW()), COALESCE($7, NOW()))
            ON CONFLICT (id) DO UPDATE SET
              visitor_name = EXCLUDED.visitor_name,
              origin = EXCLUDED.origin,
              is_safe_origin = EXCLUDED.is_safe_origin,
              entry_time = EXCLUDED.entry_time
          `;
          await client.query(q, [
            r.id, farmId, r.visitor_name || null, r.origin || null, r.is_safe_origin, r.entry_time, r.created_at
          ]);
        }
    };

    const upsertUserPoints = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          const q = `
            INSERT INTO user_points (id, farm_id, user_id, points, reason, created_at)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
            ON CONFLICT (id) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              points = EXCLUDED.points,
              reason = EXCLUDED.reason
          `;
          await client.query(q, [
            r.id, farmId, r.user_id, r.points, r.reason || null, r.created_at
          ]);
        }
    };

    const upsertRoles = async (rows) => {
        for (const r of rows) {
          if (!r) continue;
          
          // Now using UUIDs for all roles
          if (r.id) {
             const q = `
                INSERT INTO roles (id, farm_id, name, description, created_at, deleted_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    deleted_at = EXCLUDED.deleted_at
             `;
             await client.query(q, [
                 r.id, farmId, r.name, r.description, r.created_at || new Date().toISOString(), r.deleted_at || null
             ]);
          } else {
             // Fallback if no ID provided (should not happen with updated frontend)
             // Try to find by name
             const found = await client.query('SELECT id FROM roles WHERE farm_id = $1 AND name = $2', [farmId, r.name]);
             
             if (found.rows.length > 0) {
                 await client.query('UPDATE roles SET description = $2, deleted_at = $3 WHERE id = $1', 
                    [found.rows[0].id, r.description || null, r.deleted_at || null]);
             } else {
                 await client.query('INSERT INTO roles (farm_id, name, description, created_at) VALUES ($1, $2, $3, $4)', 
                    [farmId, r.name, r.description, r.created_at || new Date().toISOString()]);
             }
          }
        }
    };

    const upsertRolePermissions = async (rows) => {
        for (const r of rows) {
            if (!r.role_id || !r.permission_id) continue;
            
            // Standard upsert
            const q = `
                INSERT INTO role_permissions (role_id, permission_id)
                VALUES ($1, $2)
                ON CONFLICT (role_id, permission_id) DO NOTHING
            `;
            // We can optionally check if role exists to avoid FK error if role sync failed
            // but in a transaction with upsertRoles first, it should be fine.
            try {
                await client.query(q, [r.role_id, r.permission_id]);
            } catch (err) {
                // Ignore FK violation if role doesn't exist (e.g. partial sync)
                if (err.code !== '23503') throw err;
                console.warn(`Skipping permission for missing role: ${r.role_id}`);
            }
        }
    };


    // --- Execute Changes ---
    if (changes) {
      if (Array.isArray(changes.sections)) await upsertSections(changes.sections);
      if (Array.isArray(changes.pens)) await upsertPens(changes.pens);
      if (Array.isArray(changes.pigs)) await upsertPigs(changes.pigs);
      if (Array.isArray(changes.health_events)) await upsertHealthEvents(changes.health_events);
      if (Array.isArray(changes.weight_logs)) await upsertWeightLogs(changes.weight_logs);
      if (Array.isArray(changes.breeding_events)) await upsertBreedingEvents(changes.breeding_events);
      if (Array.isArray(changes.feed_inventory)) await upsertFeedInventory(changes.feed_inventory);
      if (Array.isArray(changes.feed_usage)) await upsertFeedUsage(changes.feed_usage);
      if (Array.isArray(changes.access_logs)) await upsertAccessLogs(changes.access_logs);
      if (Array.isArray(changes.user_points)) await upsertUserPoints(changes.user_points);
      
      if (Array.isArray(changes.roles)) await upsertRoles(changes.roles);
      if (Array.isArray(changes.role_permissions)) await upsertRolePermissions(changes.role_permissions);
      
      if (Array.isArray(changes.medications)) await upsertMedications(changes.medications);
    }

    await client.query('COMMIT');

    // --- Pull Logic ---
    const cutoffDate = lastPulledAt ? new Date(lastPulledAt) : new Date(0);
    const responseChanges = {};

    const pull = async (table, tableNameInRes) => {
      let timeFilter = '(COALESCE(updated_at, created_at) > $2 OR deleted_at > $2)';
      
      if (['role_permissions', 'user_points'].includes(table)) {
          if (table === 'role_permissions') {
             const q = `
                SELECT rp.* 
                FROM role_permissions rp
                JOIN roles r ON rp.role_id = r.id
                WHERE r.farm_id = $1
             `;
             // Note: role_permissions usually doesn't have updated_at, so we might pull all or fallback
             // For simplicity, pulling all for the farm is safer for pivot tables unless they have timestamps
             const r = await client.query(q, [farmId]);
             responseChanges[tableNameInRes] = { updated: r.rows, created: [], deleted: [] };
             return;
          }
          if (table === 'user_points') {
              timeFilter = 'created_at > $2';
          }
       } else if (table === 'roles') {
           timeFilter = '(created_at > $2 OR deleted_at > $2)';
       }

       const q = `
        SELECT * FROM ${table}
        WHERE farm_id = $1
          AND ${timeFilter}
      `;
      const r = await client.query(q, [farmId, cutoffDate]);
      // Dexie expects { created: [], updated: [], deleted: [] } usually, or just a list.
      // The WatermelonDB style is { changes: { table: { created, updated, deleted } } }
      // But looking at the user's previous code (src/controllers/syncController.js), it returned:
      // changes: { pigs: { created: [], updated: updatedPigs, deleted: [] } ... }
      
      // We will follow that format.
      responseChanges[tableNameInRes] = { 
          created: [], 
          updated: r.rows, 
          deleted: [] // We are sending deleted records in 'updated' with deleted_at set, which frontend handles?
                      // Or we should separate them?
                      // The src controller put everything in 'updated'. Let's stick to that for now.
      };
    };

    // List of tables to pull
    await pull('sections', 'sections');
    await pull('pens', 'pens');
    await pull('pigs', 'pigs');
    await pull('health_events', 'health_events');
    await pull('weight_logs', 'weight_logs');
    await pull('breeding_events', 'breeding_events');
    await pull('feed_inventory', 'feed_inventory');
    await pull('feed_usage', 'feed_usage');
    await pull('access_logs', 'access_logs');
    await pull('user_points', 'user_points');
    await pull('roles', 'roles');
    await pull('role_permissions', 'role_permissions');
    await pull('medications', 'medications');

    res.json({
        status: 'success',
        timestamp: new Date().toISOString(),
        changes: responseChanges
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync Error:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

// --- Compatibility Endpoints ---

const pushChanges = sync;

const pullChanges = async (req, res) => {
    // GET request adapter for sync
    try {
        const { lastPulledAt } = req.query;
        // Mock request object to reuse sync logic
        const mockReq = {
            ...req,
            body: {
                lastPulledAt,
                changes: {} // No changes to push
            },
            user: req.user
        };
        
        await sync(mockReq, res);
    } catch (error) {
        console.error('Pull Error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { sync, pushChanges, pullChanges };
