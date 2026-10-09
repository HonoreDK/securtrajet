-- ============================================================
-- SecurTrajet - Schema Supabase complet
-- Isolation parent / Admin / Trial 1 mois / Abonnement 2500
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- pour géofencing précis (optionnel)

-- ============================================================
-- 1. PROFILES (étend auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT NOT NULL DEFAULT 'parent' CHECK (role IN ('parent', 'admin')),
  phone TEXT,
  avatar_url TEXT,
  -- Abonnement
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  subscription_status TEXT NOT NULL DEFAULT 'trial' 
    CHECK (subscription_status IN ('trial', 'active', 'expired', 'pending_approval')),
  subscription_started_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  last_payment_at TIMESTAMPTZ,
  -- Admin approval
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger pour créer le profile automatiquement
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name, trial_ends_at, subscription_status, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NOW() + INTERVAL '30 days',
    'pending_approval',  -- en attente validation admin
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. CHILDREN
-- ============================================================
CREATE TABLE public.children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  birth_date DATE,
  photo_url TEXT,
  tracker_id TEXT UNIQUE,
  qxgps_imei TEXT UNIQUE, -- IMEI du traceur physique QXGPS associé (optionnel)
  battery INTEGER DEFAULT 100,
  status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'low_battery')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_children_parent ON public.children(parent_id);

-- ============================================================
-- 3. POSITIONS (historique GPS)
-- ============================================================
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION DEFAULT 0,
  battery INTEGER,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_child_time ON public.positions(child_id, recorded_at DESC);
CREATE INDEX idx_positions_parent ON public.positions(parent_id);

-- ============================================================
-- 4. GEOFENCES (zones sécurisées)
-- ============================================================
CREATE TABLE public.geofences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE, -- null = tous les enfants
  name TEXT NOT NULL,
  type TEXT DEFAULT 'circle' CHECK (type IN ('circle', 'polygon')),
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_meters INTEGER DEFAULT 150,
  -- pour polygon on stockera un JSON de points plus tard
  alert_on_enter BOOLEAN DEFAULT true,
  alert_on_exit BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. ALERTS
-- ============================================================
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN (
    'geofence_enter', 'geofence_exit', 'low_battery', 
    'offline', 'sos', 'speed', 'subscription'
  )),
  title TEXT,
  message TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_parent ON public.alerts(parent_id, created_at DESC);

-- ============================================================
-- 6. Fonction de vérification d'abonnement + trial
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  p public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;
  
  -- Admin a toujours accès
  IF p.role = 'admin' THEN RETURN true; END IF;
  
  -- Doit être approuvé
  IF NOT p.is_approved THEN RETURN false; END IF;
  
  -- Trial encore valide
  IF p.subscription_status = 'trial' AND p.trial_ends_at > NOW() THEN
    RETURN true;
  END IF;
  
  -- Abonnement actif (jusqu'à sa date de fin ; NULL = sans expiration, anciens abonnements)
  IF p.subscription_status = 'active'
     AND (p.subscription_ends_at IS NULL OR p.subscription_ends_at > NOW()) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. Géofencing - fonction de vérification (appelée après insert position)
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_geofences()
RETURNS TRIGGER AS $$
DECLARE
  g RECORD;
  distance_m DOUBLE PRECISION;
  was_inside BOOLEAN;
  is_inside BOOLEAN;
BEGIN
  FOR g IN 
    SELECT * FROM public.geofences 
    WHERE parent_id = NEW.parent_id 
      AND is_active = true
      AND (child_id IS NULL OR child_id = NEW.child_id)
  LOOP
    -- Distance Haversine approximative (mètres)
    distance_m := (
      6371000 * acos(
        cos(radians(g.center_lat)) * cos(radians(NEW.latitude)) *
        cos(radians(NEW.longitude) - radians(g.center_lng)) +
        sin(radians(g.center_lat)) * sin(radians(NEW.latitude))
      )
    );
    
    is_inside := distance_m <= g.radius_meters;
    
    -- On pourrait stocker l'état précédent, ici simplification :
    -- on génère une alerte si on est juste à la limite (démo)
    -- En production on garde un last_state par enfant/geofence
    
    IF is_inside AND g.alert_on_enter THEN
      -- Pour éviter spam, on pourrait checker la dernière alerte
      INSERT INTO public.alerts (parent_id, child_id, type, title, message, latitude, longitude)
      VALUES (
        NEW.parent_id, NEW.child_id, 'geofence_enter',
        'Entrée dans zone',
        'L''enfant est entré dans la zone "' || g.name || '"',
        NEW.latitude, NEW.longitude
      );
    END IF;
  END LOOP;
  
  -- Mettre à jour batterie / status de l'enfant
  UPDATE public.children 
  SET battery = NEW.battery,
      last_seen_at = NEW.recorded_at,
      status = CASE 
        WHEN NEW.battery < 15 THEN 'low_battery' 
        ELSE 'online' 
      END
  WHERE id = NEW.child_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_position_insert
  AFTER INSERT ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.check_geofences();

-- ============================================================
-- 8. RLS (Row Level Security) - CRITIQUE pour isolation
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Fonction SECURITY DEFINER : contourne RLS pour éviter la récursion
-- (une policy sur "profiles" qui interroge "profiles" en direct boucle à l'infini)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- PROFILES
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- CHILDREN : parent voit uniquement les siens
CREATE POLICY "Parents see only their children"
  ON public.children FOR SELECT
  USING (
    parent_id = auth.uid()
    OR public.is_admin()
  );

CREATE POLICY "Parents insert their children"
  ON public.children FOR INSERT
  WITH CHECK (parent_id = auth.uid() AND public.has_active_subscription(auth.uid()));

CREATE POLICY "Parents update their children"
  ON public.children FOR UPDATE
  USING (parent_id = auth.uid());

CREATE POLICY "Parents delete their children"
  ON public.children FOR DELETE
  USING (parent_id = auth.uid());

-- POSITIONS
CREATE POLICY "Parents see only their positions"
  ON public.positions FOR SELECT
  USING (parent_id = auth.uid() OR public.is_admin());

CREATE POLICY "Insert positions (device or parent)"
  ON public.positions FOR INSERT
  WITH CHECK (
    parent_id = auth.uid() 
    OR true -- en production restreindre via service_role ou API key device
  );

-- GEOFENCES
CREATE POLICY "Parents manage their geofences"
  ON public.geofences FOR ALL
  USING (parent_id = auth.uid());

-- ALERTS
CREATE POLICY "Parents see their alerts"
  ON public.alerts FOR SELECT
  USING (parent_id = auth.uid());

CREATE POLICY "Parents update their alerts"
  ON public.alerts FOR UPDATE
  USING (parent_id = auth.uid());

-- ============================================================
-- 8b. Realtime : le dashboard s'abonne aux changements en direct
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.children;
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;

-- ============================================================
-- 9. Vue pour le statut d'abonnement (pratique côté client)
-- ============================================================
CREATE OR REPLACE VIEW public.my_subscription AS
SELECT 
  id,
  subscription_status,
  trial_ends_at,
  is_approved,
  role,
  public.has_active_subscription(id) AS has_access,
  CASE 
    WHEN subscription_status = 'trial' THEN 
      GREATEST(0, EXTRACT(DAY FROM (trial_ends_at - NOW()))::INTEGER)
    ELSE NULL
  END AS trial_days_left
FROM public.profiles
WHERE id = auth.uid();

-- ============================================================
-- 10. Photos de profil (parents + enfants) via Supabase Storage
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Parents upload their own avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Parents update their own avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Parents delete their own avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- 11. Notifications push (Web Push)
-- ============================================================
CREATE TABLE public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Parents manage their push subscriptions"
  ON public.push_subscriptions FOR ALL
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

-- Déclenche l'envoi d'une notification push à chaque nouvelle alerte (voir Edge Function send-push).
CREATE OR REPLACE FUNCTION public.notify_push_on_alert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
    body := jsonb_build_object('alert_id', NEW.id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_alert_created_push
  AFTER INSERT ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_alert();

-- ============================================================
-- 12. Paiements CamPay (Orange Money / MTN MoMo)
-- ============================================================
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  campay_reference TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XAF',
  phone TEXT,
  operator TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESSFUL', 'FAILED')),
  applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_parent ON public.payments(parent_id, created_at DESC);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Lecture seule pour le parent ; l'écriture passe uniquement par l'Edge Function (service_role)
CREATE POLICY "Parents see their payments"
  ON public.payments FOR SELECT
  USING (parent_id = auth.uid() OR public.is_admin());

-- Un parent ne peut pas modifier lui-même rôle / approbation / abonnement
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

CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- ============================================================
-- 13. Paiement manuel (Orange Money / MTN MoMo) + réglages
-- ============================================================
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

-- ============================================================
-- 14. Notifications de paiement manuel (alerte admin + numéro de reçu)
-- ============================================================
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

-- ============================================================
-- 15. CONNEXION PAR NUMÉRO DE TÉLÉPHONE (voir aussi add_phone_login.sql)
-- ============================================================
-- 1. Normalisation : « +237 6 91 23 45 67 », « 691234567 » → '691234567' ; sinon NULL
CREATE OR REPLACE FUNCTION public.normalize_phone(p TEXT)
RETURNS TEXT AS $
DECLARE
  d TEXT;
BEGIN
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  IF length(d) = 12 AND left(d, 3) = '237' THEN
    d := substr(d, 4);
  END IF;
  IF d ~ '^6[0-9]{8} :
-- 1. Créer un projet sur https://supabase.com
-- 2. Aller dans SQL Editor → New query → coller ce fichier → Run
-- 3. Dans Authentication → Providers : activer Email
-- 4. Copier Project URL + anon key dans le frontend (.env)
-- ============================================================
 THEN
    RETURN d;
  END IF;
  RETURN NULL;
END;
$ LANGUAGE plpgsql IMMUTABLE;

-- Anciennes valeurs libres : on garde celles qui sont exploitables, les autres sont effacées
UPDATE public.profiles
   SET phone = public.normalize_phone(phone)
 WHERE phone IS NOT NULL
   AND phone IS DISTINCT FROM public.normalize_phone(phone);

-- 2. Un numéro = un seul compte
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique
  ON public.profiles (phone) WHERE phone IS NOT NULL;

-- 3. Tout numéro enregistré (inscription ou page Paramètres) est normalisé et vérifié
CREATE OR REPLACE FUNCTION public.normalize_profile_phone()
RETURNS TRIGGER AS $
BEGIN
  IF TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone THEN
    IF NEW.phone IS NULL OR btrim(NEW.phone) = '' THEN
      NEW.phone := NULL;
    ELSE
      NEW.phone := public.normalize_phone(NEW.phone);
      IF NEW.phone IS NULL THEN
        RAISE EXCEPTION 'Numéro de téléphone invalide : 9 chiffres commençant par 6 (ex : 691234567).';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS normalize_profile_phone ON public.profiles;
CREATE TRIGGER normalize_profile_phone
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_phone();

-- 4. À l'inscription, le numéro saisi est repris dans le profil. Un numéro déjà pris ne doit
--    jamais empêcher la création du compte : il est simplement laissé vide.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $
DECLARE
  v_phone TEXT := public.normalize_phone(NEW.raw_user_meta_data->>'phone');
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, phone, trial_ends_at, subscription_status, is_approved)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      v_phone,
      NOW() + INTERVAL '30 days',
      'pending_approval',
      false
    );
  EXCEPTION WHEN unique_violation THEN
    IF v_phone IS NULL THEN RAISE; END IF;
    INSERT INTO public.profiles (id, email, first_name, last_name, phone, trial_ends_at, subscription_status, is_approved)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      NULL,
      NOW() + INTERVAL '30 days',
      'pending_approval',
      false
    );
  END;
  RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Disponibilité d'un numéro (formulaire d'inscription, avant création du compte)
CREATE OR REPLACE FUNCTION public.phone_available(p_phone TEXT)
RETURNS BOOLEAN AS $
  SELECT public.normalize_phone(p_phone) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE phone = public.normalize_phone(p_phone));
$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.phone_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.phone_available(TEXT) TO anon, authenticated;

-- 6. Échecs de connexion par numéro (anti-devinette du mot de passe) : réservé à la fonction Edge
CREATE TABLE IF NOT EXISTS public.phone_login_attempts (
  id BIGSERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_phone_login_attempts ON public.phone_login_attempts (phone, attempted_at);
ALTER TABLE public.phone_login_attempts ENABLE ROW LEVEL SECURITY;  -- aucune policy : service role uniquement

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 16. CONNEXION AVEC GOOGLE : nom repris du compte Google (voir aussi add_google_login.sql)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $
DECLARE
  meta    JSONB := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_phone TEXT  := public.normalize_phone(meta->>'phone');
  v_full  TEXT  := btrim(coalesce(meta->>'full_name', meta->>'name', ''));
  v_first TEXT  := coalesce(
                     nullif(btrim(meta->>'first_name'), ''),
                     nullif(btrim(meta->>'given_name'), ''),
                     nullif(split_part(v_full, ' ', 1), ''),
                     '');
  v_last  TEXT  := coalesce(
                     nullif(btrim(meta->>'last_name'), ''),
                     nullif(btrim(meta->>'family_name'), ''),
                     nullif(btrim(substr(v_full, length(split_part(v_full, ' ', 1)) + 1)), ''),
                     '');
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, phone, trial_ends_at, subscription_status, is_approved)
    VALUES (NEW.id, NEW.email, v_first, v_last, v_phone, NOW() + INTERVAL '30 days', 'pending_approval', false);
  EXCEPTION WHEN unique_violation THEN
    -- Numéro déjà pris : le compte est créé quand même, sans numéro
    IF v_phone IS NULL THEN RAISE; END IF;
    INSERT INTO public.profiles (id, email, first_name, last_name, phone, trial_ends_at, subscription_status, is_approved)
    VALUES (NEW.id, NEW.email, v_first, v_last, NULL, NOW() + INTERVAL '30 days', 'pending_approval', false);
  END;
  RETURN NEW;
END;
$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- FIN - Instructions :
-- 1. Créer un projet sur https://supabase.com
-- 2. Aller dans SQL Editor → New query → coller ce fichier → Run
-- 3. Dans Authentication → Providers : activer Email
-- 4. Copier Project URL + anon key dans le frontend (.env)
-- ============================================================
