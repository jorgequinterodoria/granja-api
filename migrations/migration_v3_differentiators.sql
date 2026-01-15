-- MODULE 1: COSTS & INVENTORY

-- Table: feed_inventory
CREATE TABLE IF NOT EXISTS feed_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    cost_per_kg DECIMAL(10, 2) NOT NULL CHECK (cost_per_kg >= 0),
    current_stock_kg DECIMAL(10, 2) NOT NULL DEFAULT 0,
    batch_number VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
DROP TRIGGER IF EXISTS update_feed_inventory_updated_at ON feed_inventory;
CREATE TRIGGER update_feed_inventory_updated_at BEFORE UPDATE ON feed_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Table: feed_usage
CREATE TABLE IF NOT EXISTS feed_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pig_id UUID NOT NULL REFERENCES pigs(id) ON DELETE CASCADE,
    feed_id UUID NOT NULL REFERENCES feed_inventory(id),
    amount_kg DECIMAL(10, 2) NOT NULL CHECK (amount_kg > 0),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
DROP TRIGGER IF EXISTS update_feed_usage_updated_at ON feed_usage;
CREATE TRIGGER update_feed_usage_updated_at BEFORE UPDATE ON feed_usage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Deduct stock from inventory on usage
CREATE OR REPLACE FUNCTION deduct_feed_stock()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE feed_inventory
    SET current_stock_kg = current_stock_kg - NEW.amount_kg,
        updated_at = NOW()
    WHERE id = NEW.feed_id;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_deduct_feed_stock ON feed_usage;
CREATE TRIGGER trigger_deduct_feed_stock
AFTER INSERT ON feed_usage
FOR EACH ROW
EXECUTE FUNCTION deduct_feed_stock();


-- MODULE 2: BIOSECURITY

-- Table: sanitary_zones
CREATE TABLE IF NOT EXISTS sanitary_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    requires_shower BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
-- Seed some zones
INSERT INTO sanitary_zones (name, requires_shower) VALUES 
('Zona Sucia / Administrativa', FALSE),
('Zona Intermedia / Cuarentena', TRUE),
('Zona Limpia / Maternidad', TRUE)
ON CONFLICT DO NOTHING;

-- Table: access_logs
CREATE TABLE IF NOT EXISTS access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    visitor_name VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    vehicle_plate VARCHAR(50),
    origin VARCHAR(255) NOT NULL, -- Where they come from
    risk_level VARCHAR(50) NOT NULL CHECK (risk_level IN ('Bajo', 'Medio', 'Alto')),
    entry_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    exit_time TIMESTAMP WITH TIME ZONE,
    zone_id UUID REFERENCES sanitary_zones(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
DROP TRIGGER IF EXISTS update_access_logs_updated_at ON access_logs;
CREATE TRIGGER update_access_logs_updated_at BEFORE UPDATE ON access_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- MODULE 3: GAMIFICATION

-- Table: user_points
CREATE TABLE IF NOT EXISTS user_points (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100) NOT NULL, -- Logical ID from frontend or Auth
    points INTEGER NOT NULL DEFAULT 0,
    reason VARCHAR(255) NOT NULL,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
DROP TRIGGER IF EXISTS update_user_points_updated_at ON user_points;
CREATE TRIGGER update_user_points_updated_at BEFORE UPDATE ON user_points FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
