-- ============================================================
-- Connexion par numéro de téléphone (en plus de l'e-mail)
-- À exécuter dans Supabase > SQL Editor (réexécutable sans risque).
-- Le numéro est stocké dans profiles.phone au format national : 9 chiffres commençant par 6.
-- La connexion elle-même passe par la fonction Edge "phone-login".
-- ============================================================

-- 1. Normalisation : « +237 6 91 23 45 67 », « 691234567 » → '691234567' ; sinon NULL
CREATE OR REPLACE FUNCTION public.normalize_phone(p TEXT)
RETURNS TEXT AS $$
DECLARE
  d TEXT;
BEGIN
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  IF length(d) = 12 AND left(d, 3) = '237' THEN
    d := substr(d, 4);
  END IF;
  IF d ~ '^6[0-9]{8}$' THEN
    RETURN d;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS normalize_profile_phone ON public.profiles;
CREATE TRIGGER normalize_profile_phone
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_profile_phone();

-- 4. À l'inscription, le numéro saisi est repris dans le profil. Un numéro déjà pris ne doit
--    jamais empêcher la création du compte : il est simplement laissé vide.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Disponibilité d'un numéro (formulaire d'inscription, avant création du compte)
CREATE OR REPLACE FUNCTION public.phone_available(p_phone TEXT)
RETURNS BOOLEAN AS $$
  SELECT public.normalize_phone(p_phone) IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE phone = public.normalize_phone(p_phone));
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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
