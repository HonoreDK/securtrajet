-- 1. Le job cron s'exécute-t-il, et avec quel statut ?
SELECT jobid, runid, status, return_message, start_time, end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- 2. Que répond réellement l'appel HTTP vers qxgps-sync ?
SELECT id, status_code, content, created
FROM net._http_response
ORDER BY created DESC
LIMIT 10;
