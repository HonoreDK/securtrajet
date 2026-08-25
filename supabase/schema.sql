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
  -- Abonnement
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  subscription_status TEXT NOT NULL DEFAULT 'trial' 
    CHECK (subscription_status IN ('trial', 'active', 'expired', 'pending_approval')),
  subscription_started_at TIMESTAMPTZ,
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
  
  -- Abonnement actif
  IF p.subscription_status = 'active' THEN
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
-- FIN - Instructions :
-- 1. Créer un projet sur https://supabase.com
-- 2. Aller dans SQL Editor → New query → coller ce fichier → Run
-- 3. Dans Authentication → Providers : activer Email
-- 4. Copier Project URL + anon key dans le frontend (.env)
-- ============================================================
