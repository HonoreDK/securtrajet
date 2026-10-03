-- Paiements réels via CamPay (Orange Money / MTN MoMo)
-- Aucun secret dans ce fichier : les identifiants CamPay vivent uniquement dans les
-- secrets des Edge Functions.

-- 1. Date de fin d'abonnement (un abonnement mensuel doit expirer s'il n'est pas renouvelé)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- 2. Historique des paiements. Écrit uniquement par l'Edge Function (service_role) ;
--    les parents peuvent seulement lire les leurs.
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campay_reference TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XAF',
  phone TEXT,
  operator TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED')),
  applied BOOLEAN NOT NULL DEFAULT false, -- true une fois l'abonnement prolongé (évite un double crédit)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_parent ON public.payments(parent_id, created_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents see their payments" ON public.payments;
CREATE POLICY "Parents see their payments"
  ON public.payments FOR SELECT
  USING (parent_id = auth.uid() OR public.is_admin());

-- 3. Empêche un parent de modifier lui-même ses champs sensibles (rôle, approbation,
--    abonnement). Sans ça, il pouvait s'activer un abonnement ou se passer admin depuis la
--    console du navigateur. Restent libres : les admins, et les appels sans utilisateur
--    connecté (Edge Functions en service_role, SQL Editor, Table Editor).
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  NEW.role := OLD.role;
  NEW.is_approved := OLD.is_approved;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  NEW.subscription_status := OLD.subscription_status;
  NEW.trial_ends_at := OLD.trial_ends_at;
  NEW.subscription_started_at := OLD.subscription_started_at;
  NEW.subscription_ends_at := OLD.subscription_ends_at;
  NEW.last_payment_at := OLD.last_payment_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- 4. Un abonnement "actif" donne accès seulement jusqu'à sa date de fin.
--    (subscription_ends_at NULL = abonnements antérieurs à ce changement, conservés sans expiration)
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p.role = 'admin' THEN RETURN true; END IF;
  IF NOT p.is_approved THEN RETURN false; END IF;

  IF p.subscription_status = 'trial' AND p.trial_ends_at > NOW() THEN
    RETURN true;
  END IF;

  IF p.subscription_status = 'active'
     AND (p.subscription_ends_at IS NULL OR p.subscription_ends_at > NOW()) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
