
-- Ensure 'name' column exists in permissions table (as seen in schema check)
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS name VARCHAR(255);

-- Insert default permissions if they don't exist
INSERT INTO permissions (slug, name, description) VALUES
-- Pigs Module
('pigs.view', 'Ver Cerdos', 'Permite ver el listado y detalles de cerdos'),
('pigs.create', 'Crear Cerdos', 'Permite registrar nuevos cerdos'),
('pigs.edit', 'Editar Cerdos', 'Permite modificar datos de cerdos'),
('pigs.delete', 'Eliminar Cerdos', 'Permite eliminar registros de cerdos'),

-- Feeding Module
('feed.view', 'Ver Alimentación', 'Permite ver registros de alimentación e inventario'),
('feed.log', 'Registrar Alimentación', 'Permite registrar consumo de alimento'),
('feed.inventory', 'Gestionar Inventario', 'Permite ajustar stock de alimento'),

-- Health Module
('health.view', 'Ver Salud', 'Permite ver historial médico'),
('health.create', 'Registrar Eventos', 'Permite registrar vacunas, enfermedades y tratamientos'),

-- Finance Module
('finance.view', 'Ver Finanzas', 'Permite ver costos y rentabilidad'),
('finance.manage', 'Gestionar Finanzas', 'Permite configurar precios y costos base'),

-- Admin Module
('admin.manage', 'Administración Total', 'Acceso completo a configuración y usuarios')
ON CONFLICT (slug) DO NOTHING;
