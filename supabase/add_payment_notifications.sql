-- Notifications du paiement manuel : alerte (donc notification push) pour chaque admin à chaque
-- nouvelle demande, et colonnes pour le reçu envoyé au parent après validation.
-- Aucun secret dans ce fichier. À exécuter APRÈS add_manual_payments.sql et add_push_notifications.sql.

-- 1. Reçu : numéro séquentiel (REC-000001...) et date d'envoi (évite les doubles envois)
ALTER TABLE public.manual_payments ADD COLUMN IF NOT EXISTS receipt_no BIGINT GENERATED ALWAYS AS IDENTITY;
ALTER TABLE public.manual_payments ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ;

-- 2. Chaque nouvelle demande crée une alerte pour chaque administrateur. Le trigger existant
--    on_alert_created_push envoie ensuite la notification push sur leurs appareils.
--    Une erreur ici ne doit jamais empêcher le parent de déclarer son paiement.
CREATE OR REPLACE FUNCTION public.notify_admins_new_manual_payment()
RETURNS TRIGGER AS $$
DECLARE
  who TEXT;
BEGIN
  BEGIN
    SELECT coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), email)
      INTO who FROM public.profiles WHERE id = NEW.parent_id;

    INSERT INTO public.alerts (parent_id, type, title, message)
    SELECT id, 'subscription', 'Paiement à vérifier',
           coalesce(who, 'Un parent') || ' a déclaré 2 500 FCFA ('
             || CASE NEW.provider WHEN 'orange' THEN 'Orange Money' ELSE 'MTN MoMo' END
             || ', réf. ' || NEW.transaction_ref || ').'
    FROM public.profiles WHERE role = 'admin';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_admins_new_manual_payment: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS notify_admins_new_manual_payment ON public.manual_payments;
CREATE TRIGGER notify_admins_new_manual_payment
  AFTER INSERT ON public.manual_payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_manual_payment();
