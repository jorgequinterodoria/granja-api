const db = require('../config/db');

exports.getTasks = async (req, res) => {
    const farmId = req.farmId;

    try {
        const tasks = [];
        const today = new Date();

        // 1. Breeding Tasks (Gestation & Weaning)
        // Get latest breeding event for each pig
        const breedingQuery = `
            SELECT DISTINCT ON (be.pig_id) 
                be.pig_id, be.event_type, be.date, p.tag_number 
            FROM breeding_events be
            JOIN pigs p ON be.pig_id = p.id
            WHERE be.farm_id = $1 AND p.deleted_at IS NULL
            ORDER BY be.pig_id, be.date DESC
        `;
        const breedingRes = await db.query(breedingQuery, [farmId]);

        breedingRes.rows.forEach(event => {
            const eventDate = new Date(event.date);
            const daysSince = Math.floor((today - eventDate) / (1000 * 60 * 60 * 24));

            if (event.event_type === 'Monta') {
                // Gestation is ~114 days. Alert around 110.
                if (daysSince >= 105 && daysSince <= 120) {
                    tasks.push({
                        id: `birth-${event.pig_id}`,
                        type: 'parto',
                        title: `Preparar Parto (Cerda ${event.tag_number})`,
                        date: new Date(eventDate.setDate(eventDate.getDate() + 114)).toISOString(),
                        priority: 'high',
                        pig_id: event.pig_id
                    });
                }
            } else if (event.event_type === 'Parto') {
                // Weaning is ~21-28 days. Alert around 21.
                if (daysSince >= 18 && daysSince <= 30) {
                    tasks.push({
                        id: `wean-${event.pig_id}`,
                        type: 'destete',
                        title: `Destetar Lechones (Cerda ${event.tag_number})`,
                        date: new Date(eventDate.setDate(eventDate.getDate() + 21)).toISOString(),
                        priority: 'medium',
                        pig_id: event.pig_id
                    });
                }
            }
        });

        // 2. Health Withdrawal Tasks
        const healthQuery = `
            SELECT he.id, he.pig_id, he.withdrawal_end_date, p.tag_number
            FROM health_events he
            JOIN pigs p ON he.pig_id = p.id
            WHERE he.farm_id = $1 
              AND he.withdrawal_end_date IS NOT NULL
              AND he.withdrawal_end_date >= CURRENT_DATE
              AND p.deleted_at IS NULL
        `;
        const healthRes = await db.query(healthQuery, [farmId]);

        healthRes.rows.forEach(event => {
            // Task: Withdrawal ending soon (or today)
            const endDate = new Date(event.withdrawal_end_date);
            // If it ends today or tomorrow, show task
            const daysUntilEnd = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysUntilEnd >= 0 && daysUntilEnd <= 3) {
                 tasks.push({
                    id: `withdrawal-${event.id}`,
                    type: 'sanidad',
                    title: `Fin de Cuarentena/Retiro (Cerda ${event.tag_number})`,
                    date: event.withdrawal_end_date,
                    priority: 'high',
                    pig_id: event.pig_id
                });
            }
        });

        res.json(tasks);

    } catch (error) {
        console.error('Dashboard Tasks Error:', error);
        res.status(500).json({ error: 'Error al generar tareas' });
    }
};
