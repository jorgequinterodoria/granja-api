BEGIN;

-- 1. Add new UUID ID to roles
ALTER TABLE roles ADD COLUMN uuid_id UUID DEFAULT uuid_generate_v4();

-- 2. Add new UUID role_id to dependent tables
ALTER TABLE role_permissions ADD COLUMN role_uuid UUID;
ALTER TABLE users ADD COLUMN role_uuid UUID;

-- 3. Update dependent tables with new UUIDs based on old Integer IDs
UPDATE role_permissions rp
SET role_uuid = r.uuid_id
FROM roles r
WHERE rp.role_id = r.id;

UPDATE users u
SET role_uuid = r.uuid_id
FROM roles r
WHERE u.role_id = r.id;

-- 4. Drop constraints and old columns
-- Attempt to drop foreign keys by name (standard naming convention)
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_id_fkey;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_id_fkey;

-- Also drop the unique constraint on role_permissions if it exists (usually implicit index or named constraint)
-- We'll just drop the column which drops related indexes/constraints usually, but safe to try dropping constraint first if known.
-- We will rely on dropping the column to clean up indexes involving it.

ALTER TABLE role_permissions DROP COLUMN role_id;
ALTER TABLE users DROP COLUMN role_id;

-- 5. Rename new columns to old names
ALTER TABLE role_permissions RENAME COLUMN role_uuid TO role_id;
ALTER TABLE users RENAME COLUMN role_uuid TO role_id;

-- 6. Switch Primary Key on Roles
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_pkey CASCADE;
ALTER TABLE roles DROP COLUMN id;
ALTER TABLE roles RENAME COLUMN uuid_id TO id;
ALTER TABLE roles ADD PRIMARY KEY (id);

-- 7. Re-add Foreign Keys
ALTER TABLE role_permissions 
    ALTER COLUMN role_id SET NOT NULL;

ALTER TABLE role_permissions 
    ADD CONSTRAINT role_permissions_role_id_fkey 
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

ALTER TABLE users 
    ADD CONSTRAINT users_role_id_fkey 
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL;

-- 8. Re-add Unique Constraint on role_permissions
ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_permission_unique UNIQUE (role_id, permission_id);

COMMIT;
