-- 1. Asegurar que la extensión UUID está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Crear tabla de Historial Médico (Si no existe)
CREATE TABLE IF NOT EXISTS health_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pig_id UUID NOT NULL REFERENCES pigs(id) ON DELETE CASCADE,
    tipo_tratamiento VARCHAR(100) NOT NULL, -- Vacuna, Medicamento, Vitamina, etc.
    nombre_producto VARCHAR(255) NOT NULL,
    fecha_aplicacion DATE NOT NULL DEFAULT CURRENT_DATE,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- 3. Crear Trigger para updated_at en health_records
-- Primero borramos si existe para evitar errores de "ya existe"
DROP TRIGGER IF EXISTS update_health_records_updated_at ON health_records;

CREATE TRIGGER update_health_records_updated_at
BEFORE UPDATE ON health_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
