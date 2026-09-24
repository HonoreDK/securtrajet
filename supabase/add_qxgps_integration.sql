-- Intégration du traceur physique QXGPS (plateforme gps666.net)

ALTER TABLE public.children ADD COLUMN IF NOT EXISTS qxgps_imei TEXT UNIQUE;

-- Active les extensions nécessaires pour déclencher la synchronisation automatiquement
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Appelle la fonction qxgps-sync toutes les minutes (fréquence minimale de pg_cron).
-- Remplace <CRON_SECRET> par la valeur définie via `supabase secrets set CRON_SECRET=...`
-- avant d'exécuter ce bloc (ne jamais committer la vraie valeur dans ce fichier).
SELECT cron.schedule(
  'qxgps-sync-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://upqlzegrcudoczkdqxll.supabase.co/functions/v1/qxgps-sync',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);

-- Pour arrêter la synchronisation automatique plus tard :
-- SELECT cron.unschedule('qxgps-sync-every-minute');
