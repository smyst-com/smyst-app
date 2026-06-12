BEGIN;

DELETE FROM users
WHERE id = '10000000-0000-4000-8000-000000000001'
   OR email IN ('leonardo.demo@smyst.local', 'historical.demo@smyst.local');

COMMIT;
