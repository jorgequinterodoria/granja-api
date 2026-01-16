const db = require('../config/db');

// Allowed tables for Sync
const SYNC_TABLES = [
  'sections', 'pens', 'pigs', 'weight_logs', 'breeding_events', 
  'health_events', 'feed_inventory', 'feed_usage', 'access_logs', 'user_points'
]; 

const isUUID = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

// Unified sync endpoint (handles both push and pull)
const sync = async (req, res) => {
  const { changes, lastPulledAt } = req.body;
  const farmId = req.farmId;

  if (!farmId) {
    return res.status(400).json({ error: 'Farm ID required for sync' });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    
    if (changes) {
      // Helper to resolve section from various input formats
      const getFarmIdForSection = async (sectionId) => {
        if (sectionId == null) return null;
        if (typeof sectionId === 'string' && !/^\d+$/.test(sectionId)) return null; // Avoid UUID syntax error for int column
        const r = await db.query('SELECT farm_id FROM sections WHERE id = $1', [sectionId]);
        return r.rows.length ? r.rows[0].farm_id : null;
      };

      const resolveSection = async (rawSec, rawName, tenantFarmId) => {
        if (rawSec == null) return { id: null, farmId: tenantFarmId };
        
        // number -> direct id
        if (typeof rawSec === 'number') {
          const fid = await getFarmIdForSection(rawSec);
          return { id: rawSec, farmId: fid || tenantFarmId };
        }
        
        // string handling
        if (typeof rawSec === 'string') {
          const trimmed = rawSec.trim();
          
          // if UUID-like string (local ID), check if we have a name to resolve
          if (isUUID(trimmed)) {
            if (rawName && typeof rawName === 'string' && rawName.trim().length > 0) {
              const name = rawName.trim();
              // Try to find by name in tenant
              const found = await db.query(
                'SELECT id, farm_id FROM sections WHERE farm_id = $1 AND name = $2',
                [tenantFarmId, name]
              );
              if (found.rows.length) {
                return { id: found.rows[0].id, farmId: found.rows[0].farm_id };
              }
              // Create if not exists
              const ins = await db.query(
                'INSERT INTO sections (farm_id, name, created_at) VALUES ($1, $2, NOW()) RETURNING id, farm_id',
                [tenantFarmId, name]
              );
              return { id: ins.rows[0].id, farmId: ins.rows[0].farm_id };
            }
            // UUID without name -> cannot resolve to section, return null section but valid tenant farm
            return { id: null, farmId: tenantFarmId };
          }

          // Numeric string -> parse and use
          if (/^\d+$/.test(trimmed)) {
            const sid = parseInt(trimmed);
            const fid = await getFarmIdForSection(sid);
            return { id: sid, farmId: fid || tenantFarmId };
          }

          // Non-numeric, non-UUID string -> treat as section NAME
          const found = await db.query(
            'SELECT id, farm_id FROM sections WHERE farm_id = $1 AND name = $2',
            [tenantFarmId, trimmed]
          );
          if (found.rows.length) {
            return { id: found.rows[0].id, farmId: found.rows[0].farm_id };
          }
          const ins = await db.query(
            'INSERT INTO sections (farm_id, name, created_at) VALUES ($1, $2, NOW()) RETURNING id, farm_id',
            [tenantFarmId, trimmed]
          );
          return { id: ins.rows[0].id, farmId: ins.rows[0].farm_id };
        }

        // object { id } or { name }
        if (typeof rawSec === 'object') {
          if (rawSec.id != null) {
            const sid = (typeof rawSec.id === 'string' && /^\d+$/.test(rawSec.id)) ? parseInt(rawSec.id) : rawSec.id;
            if (typeof sid === 'number') {
                const fid = await getFarmIdForSection(sid);
                return { id: sid, farmId: fid || tenantFarmId };
            }
          }
          if (rawSec.name) {
            const name = String(rawSec.name).trim();
            const found = await db.query(
              'SELECT id, farm_id FROM sections WHERE farm_id = $1 AND name = $2',
              [tenantFarmId, name]
            );
            if (found.rows.length) {
              return { id: found.rows[0].id, farmId: found.rows[0].farm_id };
            }
            const ins = await db.query(
              'INSERT INTO sections (farm_id, name, created_at) VALUES ($1, $2, NOW()) RETURNING id, farm_id',
              [tenantFarmId, name]
            );
            return { id: ins.rows[0].id, farmId: ins.rows[0].farm_id };
          }
        }
        
        return { id: null, farmId: tenantFarmId };
      };

      const upsertPigs = async (rows) => {
        for (const r of rows) {
          if (!r || !r.id) continue;
          // Normalize pen_id from string/UUID/Number using same logic if needed, 
          // but usually pigs just have pen_id directly. If pen_id is missing, it's null.
          
          const q = `
            INSERT INTO pigs (id, farm_id, pen_id, tag_number, sex, stage, birth_date, weight, status, created_at, updated_at, deleted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'Activo'), $10, $11, $12)
            ON CONFLICT (id) DO UPDATE SET
              pen_id = EXCLUDED.pen_id,
              tag_number = EXCLUDED.tag_number,
              sex = EXCLUDED.sex,
              stage = EXCLUDED.stage,
              birth_date = EXCLUDED.birth_date,
              weight = EXCLUDED.weight,
              status = EXCLUDED.status,
              updated_at = EXCLUDED.updated_at,
              deleted_at = EXCLUDED.deleted_at
          `;
          
          await client.query(q, [
            r.id, 
            farmId, 
            r.pen_id || null, 
            r.tag_number, 
            r.sex, 
            r.stage, 
            r.birth_date, 
            r.weight,
            r.status, 
            r.created_at || null, 
            r.updated_at || new Date().toISOString(), 
            r.deleted_at || null
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
            INSERT INTO health_events (id, farm_id, pig_id, type, description, date, cost, created_at, deleted_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              pig_id = EXCLUDED.pig_id,
              type = EXCLUDED.type,
              description = EXCLUDED.description,
              date = EXCLUDED.date,
              cost = EXCLUDED.cost,
              deleted_at = EXCLUDED.deleted_at
          `;
          await client.query(q, [
            r.id, farmId, r.pig_id, r.type, r.description || null, r.date, r.cost || 0, r.created_at || new Date().toISOString(), r.deleted_at || null
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
      
      const upsertPens = async (rows) => {
        for (const r of rows) {
          if (!r) continue;
          const isNumericId = typeof r.id === 'number' || (typeof r.id === 'string' && /^\d+$/.test(r.id));
          
          // Resolve section and its farm_id
          const rawSec = r.section_id ?? r.sectionId;
          const rawName = r.section_name ?? r.sectionName;
          const tenantFarmId = isUUID(farmId) ? farmId : null; // fallback
          
          const { id: secId, farmId: penFarmId } = await resolveSection(rawSec, rawName, tenantFarmId);
          
          if (!penFarmId) {
             // Should not happen if tenantFarmId is valid, but safety check
             console.warn('Could not resolve farm ID for pen', r);
             continue; 
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
              parseInt(r.id), penFarmId, secId, r.name, r.capacity || 0, r.created_at || new Date().toISOString(), r.deleted_at || null
            ]);
          } else {
            const found = await client.query(
              `SELECT id FROM pens WHERE farm_id = $1 AND name = $2`,
              [penFarmId, r.name]
            );
            if (found.rows.length > 0) {
              await client.query(
                `UPDATE pens SET section_id = $3, capacity = $4, deleted_at = $5 WHERE id = $1 AND farm_id = $2`,
                [found.rows[0].id, penFarmId, secId, r.capacity || 0, r.deleted_at || null]
              );
            } else {
              await client.query(
                `INSERT INTO pens (farm_id, section_id, name, capacity, created_at) VALUES ($1, $2, $3, $4, $5)`,
                [penFarmId, secId, r.name, r.capacity || 0, r.created_at || new Date().toISOString()]
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
    }

    await client.query('COMMIT');

    // PULL: Get updates since lastPulledAt
    const cutoffDate = lastPulledAt ? new Date(lastPulledAt) : new Date(0);
    const responseChanges = {};

    const pull = async (table) => {
      const q = `
        SELECT * FROM ${table}
        WHERE farm_id = $1
          AND (deleted_at IS NULL OR deleted_at IS NULL)
          AND COALESCE(updated_at, created_at) > $2
      `;
      const r = await db.query(q, [farmId, cutoffDate]);
      responseChanges[table] = { updated: r.rows };
    };
    await pull('sections');
    await pull('pens');
    await pull('pigs');
    await pull('weight_logs');
    await pull('breeding_events');
    await pull('health_events');
    await pull('feed_inventory');
    await pull('feed_usage');
    await pull('access_logs');
    await pull('user_points');

    res.json({
      success: true,
      changes: responseChanges,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync Error:', error);
    res.status(500).json({ error: 'Error synchronizing data' });
  } finally {
    client.release();
  }
};

// Separate push endpoint (kept for compatibility)
const pushChanges = async (req, res) => {
  const { changes } = req.body;
  const farmId = req.farmId;

  if (!Array.isArray(changes) || changes.length === 0) {
    return res.json({ status: 'ok', processed: 0 });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');
    
    for (const change of changes) {
      const { table, type, data } = change;

      if (!SYNC_TABLES.includes(table)) {
        console.warn(`Attempt to sync blocked table: ${table}`);
        continue; 
      }

      if (data) { 
        data.farm_id = farmId; 
      }

      if (type === 'create') {
        const keys = Object.keys(data).filter(k => k !== 'created_at' && k !== 'updated_at');
        const columns = keys.join(', ');
        const values = keys.map((_, i) => `$${i + 1}`).join(', ');
        const params = keys.map(k => data[k]);
        const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        
        await client.query(
          `INSERT INTO ${table} (${columns}) VALUES (${values}) 
           ON CONFLICT (id) DO UPDATE SET ${setClause}`, 
          params
        );

      } else if (type === 'update') {
        const keys = Object.keys(data).filter(k => k !== 'id' && k !== 'farm_id' && k !== 'created_at');
        if (keys.length > 0) {
            const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
            const params = [data.id, ...keys.map(k => data[k]), farmId]; 
            
            await client.query(
            `UPDATE ${table} SET ${setClause} 
             WHERE id = $1 AND farm_id = $${keys.length + 2}`,
            params
        );
        }

      } else if (type === 'delete') {
        await client.query(
          `UPDATE ${table} SET deleted_at = NOW() 
           WHERE id = $1 AND farm_id = $2`,
          [data.id, farmId]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ status: 'ok', processed: changes.length });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync Push Error:', error);
    res.status(500).json({ error: 'Error synchronizing data' });
  } finally {
    client.release();
  }
};

// Separate pull endpoint (kept for compatibility)
const pullChanges = async (req, res) => {
  const { lastPulledAt } = req.query;
  const farmId = req.farmId;
  const cutoffDate = lastPulledAt ? new Date(lastPulledAt) : new Date(0);

  try {
    const response = {};

    for (const table of SYNC_TABLES) {
      const result = await db.query(
        `SELECT * FROM ${table} 
         WHERE farm_id = $1`,
         [farmId]
      );
      response[table] = result.rows;
    }

    const roles = await db.query('SELECT * FROM roles WHERE farm_id = $1', [farmId]);
    response['roles'] = roles.rows;

    res.json({
        changes: response,
        timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Sync Pull Error:', error);
    res.status(500).json({ error: 'Error fetching updates' });
  }
};

module.exports = { sync, pushChanges, pullChanges };
