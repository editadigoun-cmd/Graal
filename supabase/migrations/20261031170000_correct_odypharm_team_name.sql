-- Corrige le libellé historique de l'équipe ODYPHARM.
-- Les rattachements restent inchangés car ils référencent l'identifiant de l'équipe.
update public.equipes
set nom = 'ODYPHARM'
where lower(nom) = 'odypaharm';
