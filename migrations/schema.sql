-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE etapa_enum AS ENUM ('Lechón', 'Levante', 'Ceba', 'Reproductor');
CREATE TYPE sexo_enum AS ENUM ('Macho', 'Hembra');
CREATE TYPE status_enum AS ENUM ('Activo', 'Vendido', 'Fallecido');

-- Table: pigs
CREATE TABLE pigs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre VARCHAR(255),
    numero_arete VARCHAR(50) NOT NULL,
    sexo sexo_enum NOT NULL, -- Validation: Immutable check handled in app logic or trigger (complex in pure SQL without function) but Type is enforced here.
    etapa etapa_enum NOT NULL,
    peso DECIMAL(10, 2) NOT NULL CHECK (peso >= 0),
    fecha_nacimiento DATE NOT NULL CHECK (fecha_nacimiento <= CURRENT_DATE),
    status status_enum NOT NULL DEFAULT 'Activo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE -- For soft deletes if needed, though status covers most logic
);

-- Unique Index for "Active" pigs (Business Logic: Unicidad Física)
CREATE UNIQUE INDEX idx_pigs_arete_active 
ON pigs (numero_arete) 
WHERE status = 'Activo';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pigs_updated_at
BEFORE UPDATE ON pigs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Table: health_records
CREATE TABLE health_records (
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

-- Trigger for health_records
CREATE TRIGGER update_health_records_updated_at
BEFORE UPDATE ON health_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
