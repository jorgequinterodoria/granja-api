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

    // 2. Fetch updated records since lastPulledAt
    // If not provided, fetch all (initial sync)
    let pullPigsQuery = 'SELECT * FROM pigs';
    let pullHealthQuery = 'SELECT * FROM health_records';
    const pullParams = [];

    if (lastPulledAt) {
      pullPigsQuery += ' WHERE updated_at > $1';
      pullHealthQuery += ' WHERE updated_at > $1';
      // Ensure we stick to timezone format if needed, but PG handles ISO strings well
      pullParams.push(new Date(lastPulledAt)); 
    }

    const { rows: updatedPigs } = await client.query(pullPigsQuery, pullParams);
    const { rows: updatedHealth } = await client.query(pullHealthQuery, pullParams);

    await client.query('COMMIT');

    res.json({
      status: 'success',
      timestamp: new Date().toISOString(),
      changes: {
        pigs: {
            created: [], 
            updated: updatedPigs, 
            deleted: [] 
        },
        health_records: {
            created: [],
            updated: updatedHealth,
            deleted: []
        }
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
