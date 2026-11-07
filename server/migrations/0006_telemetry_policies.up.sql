ALTER TABLE telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'vehicle_id',
    timescaledb.compress_orderby = 'ts'
);

SELECT add_compression_policy('telemetry', INTERVAL '1 day');
SELECT add_retention_policy('telemetry', INTERVAL '14 days');
