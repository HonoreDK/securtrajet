-- Insère une position de test pour le premier enfant de ton compte,
-- pour vérifier que la carte/le pipeline positions -> statut fonctionne
-- sans attendre l'intégration du vrai traceur.

insert into public.positions (child_id, parent_id, latitude, longitude, speed, battery, recorded_at)
select
  c.id,
  c.parent_id,
  5.4781 + (random() - 0.5) * 0.01,   -- autour de Bafoussam, avec un peu de variation
  10.4172 + (random() - 0.5) * 0.01,
  round((random() * 30)::numeric, 1),
  85,
  now()
from public.children c
join public.profiles p on p.id = c.parent_id
where p.email = 'honoredjomokamga5@gmail.com'
order by c.created_at asc
limit 1
returning *;
