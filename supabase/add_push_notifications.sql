-- Notifications push : abonnements + déclenchement automatique sur nouvelle alerte

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents manage their push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Parents manage their push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Déclenche l'envoi d'une notification push à chaque nouvelle alerte.
-- Remplace <CRON_SECRET> par la valeur définie via `supabase secrets set CRON_SECRET=...`
-- avant d'exécuter ce bloc (ne jamais committer la vraie valeur dans ce fichier).
CREATE OR REPLACE FUNCTION public.notify_push_on_alert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://upqlzegrcudoczkdqxll.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := jsonb_build_object('alert_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_alert_created_push ON public.alerts;
CREATE TRIGGER on_alert_created_push
  AFTER INSERT ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_alert();
