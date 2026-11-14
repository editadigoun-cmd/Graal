ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS vm_a_un_secteur;
ALTER TABLE public.profiles ADD CONSTRAINT vm_a_un_secteur
CHECK ((role <> 'vm'::public.user_role) OR secteur IS NOT NULL OR equipe_id='d8e7f5d2-0d77-4c0b-8a01-000000000002'::uuid);
