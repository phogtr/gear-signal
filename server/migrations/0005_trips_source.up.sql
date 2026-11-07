ALTER TABLE trips
    ADD COLUMN source TEXT NOT NULL DEFAULT 'demo' CHECK (source IN ('demo', 'planned'));

ALTER TABLE trips ALTER COLUMN source DROP DEFAULT;
