-- Active la synchronisation en temps réel (Supabase Realtime) pour que
-- le dashboard se mette à jour automatiquement sur tous les appareils
-- dès qu'un enfant est ajouté, qu'une position ou une alerte arrive.

ALTER PUBLICATION supabase_realtime ADD TABLE public.children;
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
