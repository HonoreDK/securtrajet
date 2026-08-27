-- Photos de profil : parents (profiles.avatar_url) + enfants (children.photo_url, déjà présent)

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Bucket de stockage public pour les photos (chemin : {parent_id}/...)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Lecture publique (nécessaire pour afficher les photos sur la carte)
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Écriture réservée au parent propriétaire du dossier (avatars/{auth.uid()}/...)
DROP POLICY IF EXISTS "Parents upload their own avatars" ON storage.objects;
CREATE POLICY "Parents upload their own avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Parents update their own avatars" ON storage.objects;
CREATE POLICY "Parents update their own avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Parents delete their own avatars" ON storage.objects;
CREATE POLICY "Parents delete their own avatars"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
