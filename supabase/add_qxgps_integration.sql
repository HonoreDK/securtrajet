-- Intégration du traceur physique QXGPS (plateforme gps666.net)

ALTER TABLE public.children ADD COLUMN IF NOT EXISTS qxgps_imei TEXT UNIQUE;

-- Active les extensions nécessaires pour déclencher la synchronisation automatiquement
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Appelle la fonction qxgps-sync toutes les minutes.
-- Remplace <PROJECT_REF> et <CRON_SECRET> par tes valeurs avant d'exécuter ce bloc.
SELECT cron.schedule(
  'qxgps-sync-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/qxgps-sync',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

-- Pour arrêter la synchronisation automatique plus tard :
-- SELECT cron.unschedule('qxgps-sync-every-minute');
