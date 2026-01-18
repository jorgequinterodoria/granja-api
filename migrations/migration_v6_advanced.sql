-- Migration v6: Advanced Modules (Genetics, Health, Agenda)

-- 1. Add Genetics fields to 'pigs'
ALTER TABLE pigs 
ADD COLUMN IF NOT EXISTS father_id UUID REFERENCES pigs(id),
ADD COLUMN IF NOT EXISTS mother_id UUID REFERENCES pigs(id),
ADD COLUMN IF NOT EXISTS genetics_score INTEGER CHECK (genetics_score BETWEEN 1 AND 100);

-- 2. Create 'medications' table
CREATE TABLE IF NOT EXISTS medications (
    id UUID PRIMARY KEY,
    farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    withdrawal_days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Index for syncing
CREATE INDEX IF NOT EXISTS idx_medications_farm_id ON medications(farm_id);
CREATE INDEX IF NOT EXISTS idx_medications_updated_at ON medications(updated_at);

-- 3. Add Medication fields to 'health_events'
-- Note: schema_complete_with_superadmin.sql uses 'health_events', ensuring compatibility.
ALTER TABLE health_events
ADD COLUMN IF NOT EXISTS medication_id UUID REFERENCES medications(id),
ADD COLUMN IF NOT EXISTS withdrawal_end_date DATE;

-- Index for queries on withdrawal status
CREATE INDEX IF NOT EXISTS idx_health_events_withdrawal_end_date ON health_events(withdrawal_end_date);
