-- ============================================================
-- Migración 003: Federico (dycestudio1@gmail.com) = director
-- ============================================================
-- 1. Promueve el profile existente con ese email a role='director'.
-- 2. Reemplaza el trigger handle_new_user para que cualquier signup
--    futuro con ese email arranque ya como director (sin que tengamos
--    que correr UPDATE manual cada vez que alguien se reloguea o
--    recreamos la cuenta).
--
-- Idempotente: podés correrla múltiples veces sin romper nada.
-- ============================================================

-- ====== 1. Promover el profile existente ======
UPDATE public.profiles
SET role = 'director'
WHERE email = 'dycestudio1@gmail.com';

-- (Opcional · descomentar para promover también a Gian)
-- UPDATE public.profiles
-- SET role = 'director'
-- WHERE email = 'gian7702@gmail.com';


-- ====== 2. Trigger: nuevos signups con ese email = director ======
-- Lista de emails que automáticamente son directores. Para agregar más,
-- editá el array literal `directors` adentro de la función.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  directors text[] := ARRAY[
    'dycestudio1@gmail.com'
    -- agregar más emails de directores acá si hace falta:
    -- , 'gian7702@gmail.com'
  ];
  initial_role text;
BEGIN
  IF NEW.email = ANY(directors) THEN
    initial_role := 'director';
  ELSE
    initial_role := 'team';
  END IF;

  INSERT INTO public.profiles (id, email, name, role, initials)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    initial_role,
    UPPER(SUBSTRING(COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 1, 2))
  );
  RETURN NEW;
END;
$$;

-- El trigger (on_auth_user_created) ya existe del schema base; no hace
-- falta recrearlo porque sigue apuntando a la misma función handle_new_user
-- que acabamos de reemplazar.


-- ====== Verificación ======
-- Después de correr esto, validá con:
--   SELECT email, role, name FROM public.profiles ORDER BY role DESC, email;
-- Debería aparecer dycestudio1@gmail.com con role='director'.
