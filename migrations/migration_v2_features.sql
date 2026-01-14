-- 1. Table: weight_logs
CREATE TABLE IF NOT EXISTS weight_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pig_id UUID NOT NULL REFERENCES pigs(id) ON DELETE CASCADE,
    weight DECIMAL(10, 2) NOT NULL CHECK (weight >= 0),
    date_measured DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Trigger to update 'updated_at' for weight_logs
DROP TRIGGER IF EXISTS update_weight_logs_updated_at ON weight_logs;
CREATE TRIGGER update_weight_logs_updated_at
BEFORE UPDATE ON weight_logs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 2. Business Logic Trigger: Update current weight in 'pigs' table on new weight log
CREATE OR REPLACE FUNCTION update_pig_current_weight()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE pigs
    SET peso = NEW.weight,
        updated_at = NOW()
    WHERE id = NEW.pig_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_pig_weight ON weight_logs;
CREATE TRIGGER trigger_update_pig_weight
AFTER INSERT ON weight_logs
FOR EACH ROW
EXECUTE FUNCTION update_pig_current_weight();


-- 3. Table: breeding_events
CREATE TABLE IF NOT EXISTS breeding_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pig_id UUID NOT NULL REFERENCES pigs(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'Monta', 'Parto', 'Destete'
    details TEXT, -- JSON or text description
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Trigger to update 'updated_at' for breeding_events
DROP TRIGGER IF EXISTS update_breeding_events_updated_at ON breeding_events;
CREATE TRIGGER update_breeding_events_updated_at
BEFORE UPDATE ON breeding_events
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
