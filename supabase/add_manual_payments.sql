-- Paiement manuel : le parent envoie l'argent par Orange Money / MTN MoMo puis déclare la
-- référence de la transaction ; un administrateur vérifie la réception et valide.
-- Aucun secret dans ce fichier. À exécuter APRÈS add_campay_payments.sql.

-- 1. Réglages modifiables depuis la page Administration (numéros de réception, mode de paiement)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users read settings" ON public.app_settings;
CREATE POLICY "Authenticated users read settings"
  ON public.app_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;
CREATE POLICY "Admins manage settings"
  ON public.app_settings FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.app_settings (key, value) VALUES
  ('payment_mode', 'manual'),          -- 'manual' ou 'campay'
  ('pay_orange_number', ''),
  ('pay_mtn_number', ''),
  ('pay_recipient_name', 'Nova Tech Solution')
ON CONFLICT (key) DO NOTHING;

-- 2. Demandes de paiement manuel
CREATE TABLE IF NOT EXISTS public.manual_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('orange', 'mtn')),
  sender_phone TEXT NOT NULL CHECK (sender_phone ~ '^6[0-9]{8}$'),
  transaction_ref TEXT NOT NULL CHECK (transaction_ref ~ '^[A-Za-z0-9._-]{6,40}$'),
  amount INTEGER NOT NULL DEFAULT 2500,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_payments_parent ON public.manual_payments(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_payments_status ON public.manual_payments(status, created_at DESC);

-- Une même référence de transaction ne peut pas servir deux fois (sauf si elle a été refusée)
CREATE UNIQUE INDEX IF NOT EXISTS manual_payments_ref_unique
  ON public.manual_payments (upper(transaction_ref))
  WHERE status <> 'rejected';

ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents see their manual payments" ON public.manual_payments;
CREATE POLICY "Parents see their manual payments"
  ON public.manual_payments FOR SELECT
  USING (parent_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Parents create their manual payments" ON public.manual_payments;
CREATE POLICY "Parents create their manual payments"
  ON public.manual_payments FOR INSERT
  WITH CHECK (parent_id = auth.uid());
-- Pas de policy UPDATE/DELETE : seules les fonctions de validation ci-dessous modifient une demande.

-- À la création : le serveur impose montant et statut, limite les demandes en attente
-- et exige un compte validé (le parent ne choisit que opérateur, numéro et référence).
CREATE OR REPLACE FUNCTION public.prepare_manual_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.parent_id AND (is_approved OR role = 'admin')
  ) THEN
    RAISE EXCEPTION 'Ton compte n''est pas encore validé par un administrateur.';
  END IF;

  IF (SELECT count(*) FROM public.manual_payments
      WHERE parent_id = NEW.parent_id AND status = 'pending') >= 3 THEN
    RAISE EXCEPTION 'Tu as déjà 3 demandes en attente de vérification.';
  END IF;

  NEW.amount := 2500;
  NEW.status := 'pending';
  NEW.admin_note := NULL;
  NEW.reviewed_by := NULL;
  NEW.reviewed_at := NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS prepare_manual_payment ON public.manual_payments;
CREATE TRIGGER prepare_manual_payment
  BEFORE INSERT ON public.manual_payments
  FOR EACH ROW EXECUTE FUNCTION public.prepare_manual_payment();

-- 3. Validation par un administrateur : prolonge l'abonnement de 30 jours, une seule fois.
CREATE OR REPLACE FUNCTION public.approve_manual_payment(p_id UUID)
RETURNS VOID AS $$
DECLARE
  mp public.manual_payments%ROWTYPE;
  p public.profiles%ROWTYPE;
  base TIMESTAMPTZ;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Action réservée aux administrateurs';
  END IF;

  SELECT * INTO mp FROM public.manual_payments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF mp.status <> 'pending' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée'; END IF;

  SELECT * INTO p FROM public.profiles WHERE id = mp.parent_id FOR UPDATE;

  -- On prolonge à partir de la fin de l'abonnement/essai en cours (payer en avance ne fait rien perdre)
  base := NOW();
  IF p.subscription_status = 'active' AND p.subscription_ends_at IS NOT NULL AND p.subscription_ends_at > base THEN
    base := p.subscription_ends_at;
  ELSIF p.subscription_status = 'trial' AND p.trial_ends_at IS NOT NULL AND p.trial_ends_at > base THEN
    base := p.trial_ends_at;
  END IF;

  UPDATE public.profiles SET
    subscription_status = 'active',
    subscription_ends_at = base + INTERVAL '30 days',
    last_payment_at = NOW(),
    subscription_started_at = CASE WHEN p.subscription_status <> 'active' THEN NOW() ELSE p.subscription_started_at END,
    updated_at = NOW()
  WHERE id = mp.parent_id;

  UPDATE public.manual_payments
  SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = NOW()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.reject_manual_payment(p_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE
  mp public.manual_payments%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Action réservée aux administrateurs';
  END IF;

  SELECT * INTO mp FROM public.manual_payments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Demande introuvable'; END IF;
  IF mp.status <> 'pending' THEN RAISE EXCEPTION 'Cette demande a déjà été traitée'; END IF;

  UPDATE public.manual_payments
  SET status = 'rejected',
      admin_note = NULLIF(left(btrim(coalesce(p_note, '')), 300), ''),
      reviewed_by = auth.uid(),
      reviewed_at = NOW()
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
