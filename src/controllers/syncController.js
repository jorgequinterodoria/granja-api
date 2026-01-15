const db = require('../db');

const sync = async (req, res) => {
  const { changes, lastPulledAt } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Apply Changes (Upserts based on UUID)
    if (changes && changes.pigs && changes.pigs.length > 0) {
      for (const change of changes.pigs) {
        const { id, nombre, numero_arete, sexo, etapa, peso, fecha_nacimiento, status, deleted_at } = change;

        // Validation constraints are largely handled by DB schema (types, checks, unique index)
        // However, we handle the 'Immutable Sex' logic and error catching here.

        // Check if record exists to validate SEX Immutability
        // Optimization check: only if 'sexo' is being updated.
        // For simplicity in this logic, we query the existing pig if it exists.
        
        const existingRes = await client.query('SELECT sexo FROM pigs WHERE id = $1', [id]);
        const existing = existingRes.rows[0];

        if (existing && sexo && existing.sexo !== sexo) {
           throw new Error(`Validation Error: Sexo is immutable. Pig ID: ${id}`);
        }

        // Prepare UPSERT query
        // We handle Soft Deletes via status or deleted_at if provided
        
        const queryText = `
          INSERT INTO pigs (id, nombre, numero_arete, sexo, etapa, peso, fecha_nacimiento, status, deleted_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            numero_arete = EXCLUDED.numero_arete,
            etapa = EXCLUDED.etapa,
            peso = EXCLUDED.peso,
            fecha_nacimiento = EXCLUDED.fecha_nacimiento,
            status = EXCLUDED.status,
            deleted_at = EXCLUDED.deleted_at,
            updated_at = NOW()
            -- Note: We DO NOT update 'sexo' on conflict as per immutability rule, 
            -- although the code above throws if it tries to change. 
            -- To be double safe, we can exclude it from the SET clause, 
            -- but the throw above handles the logic.
        `;

        const values = [
            id, 
            nombre, 
            numero_arete, 
            sexo, 
            etapa, 
            peso, 
            fecha_nacimiento, 
            status || 'Activo', 
            deleted_at || null
        ];

        await client.query(queryText, values);
      }
    }

    // Process Health Records changes
    if (changes && changes.health_records && changes.health_records.length > 0) {
        for (const record of changes.health_records) {
            const { id, pig_id, tipo_tratamiento, nombre_producto, fecha_aplicacion, observaciones, deleted_at } = record;

            const queryText = `
                INSERT INTO health_records (id, pig_id, tipo_tratamiento, nombre_producto, fecha_aplicacion, observaciones, deleted_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    pig_id = EXCLUDED.pig_id,
                    tipo_tratamiento = EXCLUDED.tipo_tratamiento,
                    nombre_producto = EXCLUDED.nombre_producto,
                    fecha_aplicacion = EXCLUDED.fecha_aplicacion,
                    observaciones = EXCLUDED.observaciones,
                    deleted_at = EXCLUDED.deleted_at,
                    updated_at = NOW()
            `;
            
            const values = [id, pig_id, tipo_tratamiento, nombre_producto, fecha_aplicacion, observaciones, deleted_at || null];
            await client.query(queryText, values);
        }
    }

    // Process Weight Logs changes
    if (changes && changes.weight_logs && changes.weight_logs.length > 0) {
        for (const log of changes.weight_logs) {
            const { id, pig_id, weight, date_measured, deleted_at } = log;
            const queryText = `
                INSERT INTO weight_logs (id, pig_id, weight, date_measured, deleted_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    pig_id = EXCLUDED.pig_id,
                    weight = EXCLUDED.weight,
                    date_measured = EXCLUDED.date_measured,
                    deleted_at = EXCLUDED.deleted_at,
                    updated_at = NOW()
            `;
            await client.query(queryText, [id, pig_id, weight, date_measured, deleted_at || null]);
        }
    }

    // Process Breeding Events changes
    if (changes && changes.breeding_events && changes.breeding_events.length > 0) {
        for (const event of changes.breeding_events) {
            const { id, pig_id, event_type, details, event_date, deleted_at } = event;
            const queryText = `
                INSERT INTO breeding_events (id, pig_id, event_type, details, event_date, deleted_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    pig_id = EXCLUDED.pig_id,
                    event_type = EXCLUDED.event_type,
                    details = EXCLUDED.details,
                    event_date = EXCLUDED.event_date,
                    deleted_at = EXCLUDED.deleted_at,
                    updated_at = NOW()
            `;
            await client.query(queryText, [id, pig_id, event_type, details, event_date, deleted_at || null]);
        }
    }

    // --- MODULE 1: COSTS & INVENTORY ---
    if (changes?.feed_inventory?.length > 0) {
        for (const item of changes.feed_inventory) {
            const { id, name, cost_per_kg, current_stock_kg, batch_number, deleted_at } = item;
            await client.query(`
                INSERT INTO feed_inventory (id, name, cost_per_kg, current_stock_kg, batch_number, deleted_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name, cost_per_kg=EXCLUDED.cost_per_kg, current_stock_kg=EXCLUDED.current_stock_kg, batch_number=EXCLUDED.batch_number, deleted_at=EXCLUDED.deleted_at, updated_at=NOW()
            `, [id, name, cost_per_kg, current_stock_kg, batch_number, deleted_at || null]);
        }
    }
    if (changes?.feed_usage?.length > 0) {
        for (const item of changes.feed_usage) {
            const { id, pig_id, feed_id, amount_kg, date, deleted_at } = item;
            await client.query(`
                INSERT INTO feed_usage (id, pig_id, feed_id, amount_kg, date, deleted_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    pig_id=EXCLUDED.pig_id, feed_id=EXCLUDED.feed_id, amount_kg=EXCLUDED.amount_kg, date=EXCLUDED.date, deleted_at=EXCLUDED.deleted_at, updated_at=NOW()
            `, [id, pig_id, feed_id, amount_kg, date, deleted_at || null]);
        }
    }

    // --- MODULE 2: BIOSECURITY ---
    if (changes?.access_logs?.length > 0) {
        for (const item of changes.access_logs) {
            const { id, visitor_name, company, vehicle_plate, origin, risk_level, entry_time, exit_time, zone_id, deleted_at } = item;
            await client.query(`
                INSERT INTO access_logs (id, visitor_name, company, vehicle_plate, origin, risk_level, entry_time, exit_time, zone_id, deleted_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    visitor_name=EXCLUDED.visitor_name, company=EXCLUDED.company, vehicle_plate=EXCLUDED.vehicle_plate, origin=EXCLUDED.origin, risk_level=EXCLUDED.risk_level, entry_time=EXCLUDED.entry_time, exit_time=EXCLUDED.exit_time, zone_id=EXCLUDED.zone_id, deleted_at=EXCLUDED.deleted_at, updated_at=NOW()
            `, [id, visitor_name, company, vehicle_plate, origin, risk_level, entry_time, exit_time, zone_id, deleted_at || null]);
        }
    }

    // --- MODULE 3: GAMIFICATION ---
    if (changes?.user_points?.length > 0) {
        for (const item of changes.user_points) {
            const { id, user_id, points, reason, event_date, deleted_at } = item;
            await client.query(`
                INSERT INTO user_points (id, user_id, points, reason, event_date, deleted_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    user_id=EXCLUDED.user_id, points=EXCLUDED.points, reason=EXCLUDED.reason, event_date=EXCLUDED.event_date, deleted_at=EXCLUDED.deleted_at, updated_at=NOW()
            `, [id, user_id, points, reason, event_date, deleted_at || null]);
        }
    }


    // 2. Fetch updated records since lastPulledAt
    // If not provided, fetch all (initial sync)
    let pullPigsQuery = 'SELECT * FROM pigs';
    let pullHealthQuery = 'SELECT * FROM health_records';
    let pullWeightQuery = 'SELECT * FROM weight_logs';
    let pullBreedingQuery = 'SELECT * FROM breeding_events';
    
    // New tables queries
    let pullFeedInvQuery = 'SELECT * FROM feed_inventory';
    let pullFeedUsageQuery = 'SELECT * FROM feed_usage';
    let pullAccessQuery = 'SELECT * FROM access_logs';
    let pullZonesQuery = 'SELECT * FROM sanitary_zones';
    let pullPointsQuery = 'SELECT * FROM user_points';

    const pullParams = [];

    if (lastPulledAt) {
      const dateParam = new Date(lastPulledAt);
      pullParams.push(dateParam);
      
      pullPigsQuery += ' WHERE updated_at > $1';
      pullHealthQuery += ' WHERE updated_at > $1';
      pullWeightQuery += ' WHERE updated_at > $1';
      pullBreedingQuery += ' WHERE updated_at > $1';
      
      pullFeedInvQuery += ' WHERE updated_at > $1';
      pullFeedUsageQuery += ' WHERE updated_at > $1';
      pullAccessQuery += ' WHERE updated_at > $1';
      pullZonesQuery += ' WHERE updated_at > $1';
      pullPointsQuery += ' WHERE updated_at > $1';
    }

    const { rows: updatedPigs } = await client.query(pullPigsQuery, pullParams);
    const { rows: updatedHealth } = await client.query(pullHealthQuery, pullParams);
    const { rows: updatedWeight } = await client.query(pullWeightQuery, pullParams);
    const { rows: updatedBreeding } = await client.query(pullBreedingQuery, pullParams);
    
    const { rows: updatedFeedInv } = await client.query(pullFeedInvQuery, pullParams);
    const { rows: updatedFeedUsage } = await client.query(pullFeedUsageQuery, pullParams);
    const { rows: updatedAccess } = await client.query(pullAccessQuery, pullParams);
    const { rows: updatedZones } = await client.query(pullZonesQuery, pullParams);
    const { rows: updatedPoints } = await client.query(pullPointsQuery, pullParams);

    await client.query('COMMIT');

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      changes: {
        pigs: { created: [], updated: updatedPigs, deleted: [] },
        health_records: { created: [], updated: updatedHealth, deleted: [] },
        weight_logs: { created: [], updated: updatedWeight, deleted: [] },
        breeding_events: { created: [], updated: updatedBreeding, deleted: [] },
        
        feed_inventory: { created: [], updated: updatedFeedInv, deleted: [] },
        feed_usage: { created: [], updated: updatedFeedUsage, deleted: [] },
        access_logs: { created: [], updated: updatedAccess, deleted: [] },
        sanitary_zones: { created: [], updated: updatedZones, deleted: [] },
        user_points: { created: [], updated: updatedPoints, deleted: [] }
      } 
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Sync Error:', error);
    
    // Handle uniqueness violation specifically
    if (error.code === '23505') { // unique_violation
        return res.status(409).json({ error: 'Conflict: Numero de arete must be unique for active pigs.' });
    }
    
    // Handle Check violations
    if (error.code === '23514') { // check_violation
         return res.status(400).json({ error: 'Validation Error: Check constraints failed (Weight must be positive, Birth date not in future).' });
    }

    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
};

module.exports = { sync };
