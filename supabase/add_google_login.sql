-- ============================================================
-- Connexion avec Google : reprise du nom du compte Google à la création du profil
-- À exécuter dans Supabase > SQL Editor APRÈS add_phone_login.sql (réexécutable sans risque).
-- Google fournit « full_name » / « given_name » / « family_name » (ou « name ») au lieu de
-- first_name / last_name ; le profil reprend ce qui est disponible. Le compte reste « en attente »
-- jusqu'à la validation par un administrateur, comme pour une inscription classique.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
