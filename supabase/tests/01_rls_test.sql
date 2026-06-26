BEGIN;

-- Run tests
SELECT plan(1);

-- Just a simple test to verify pgTAP is running
SELECT pass('pgTAP is installed and running');

SELECT * FROM finish();

ROLLBACK;
