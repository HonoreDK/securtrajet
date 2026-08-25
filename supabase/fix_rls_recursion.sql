-- Corrige la récursion infinie sur les policies RLS de "profiles"
-- (erreur Postgres 42P17: "infinite recursion detected in policy for relation profiles")

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

DROP POLICY IF EXISTS "Parents see only their children" ON public.children;
CREATE POLICY "Parents see only their children"
  ON public.children FOR SELECT
  USING (parent_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Parents see only their positions" ON public.positions;
CREATE POLICY "Parents see only their positions"
  ON public.positions FOR SELECT
  USING (parent_id = auth.uid() OR public.is_admin());
