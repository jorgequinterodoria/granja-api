const db = require('../config/db');

// Recursive function to get ancestors up to N generations
// Returns a Set of ancestor IDs
const getAncestors = async (pigId, generations = 2, currentGen = 0, ancestors = new Set()) => {
    if (currentGen >= generations || !pigId) return ancestors;

    const res = await db.query('SELECT father_id, mother_id FROM pigs WHERE id = $1', [pigId]);
    if (res.rows.length === 0) return ancestors;

    const { father_id, mother_id } = res.rows[0];

    if (father_id) {
        ancestors.add(father_id);
        await getAncestors(father_id, generations, currentGen + 1, ancestors);
    }
    if (mother_id) {
        ancestors.add(mother_id);
        await getAncestors(mother_id, generations, currentGen + 1, ancestors);
    }

    return ancestors;
};

exports.checkBreeding = async (req, res) => {
    const { boarId, sowId } = req.query;

    if (!boarId || !sowId) {
        return res.status(400).json({ error: 'Se requieren boarId y sowId' });
    }

    try {
        const boarAncestors = await getAncestors(boarId);
        const sowAncestors = await getAncestors(sowId);

        // Check for direct relationship (one is parent of other)
        if (boarAncestors.has(sowId)) {
            return res.json({ safe: false, warning: 'Consanguinidad Crítica: La hembra es ancestro del macho.' });
        }
        if (sowAncestors.has(boarId)) {
            return res.json({ safe: false, warning: 'Consanguinidad Crítica: El macho es ancestro de la hembra.' });
        }

        // Check for common ancestors
        const commonAncestors = [...boarAncestors].filter(id => sowAncestors.has(id));

        if (commonAncestors.length > 0) {
            // Fetch details of common ancestor
            const ancestorDetails = await db.query('SELECT tag_number FROM pigs WHERE id = $1', [commonAncestors[0]]);
            const tag = ancestorDetails.rows[0]?.tag_number || 'Desconocido';
            
            return res.json({ 
                safe: false, 
                warning: `Riesgo de Consanguinidad: Comparten ancestro (Ej: ${tag})` 
            });
        }

        return res.json({ safe: true, warning: null });

    } catch (error) {
        console.error('Breeding Check Error:', error);
        res.status(500).json({ error: 'Error al verificar consanguinidad' });
    }
};
