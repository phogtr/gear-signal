SELECT remove_retention_policy('telemetry');
SELECT remove_compression_policy('telemetry');

-- compression can't be turned off while any chunk is compressed
SELECT decompress_chunk(c, if_compressed => true) FROM show_chunks('telemetry') AS c;

ALTER TABLE telemetry SET (timescaledb.compress = false);
