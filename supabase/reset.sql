-- ============================================================
--  PASO 1 de 2 · RESET
--  Borra TODO lo que haya en la base de datos:
--    · las tablas/vistas/funciones del esquema public
--      (aquí viven las 3 bbdd: emp_*, tie_*, con_*)
--    · los antiguos esquemas empresa / tienda / concesionario
--
--  Ejecútalo PRIMERO en el SQL Editor de Supabase.
--  Después ejecuta `esquemas.sql` (PASO 2) para crear las 3 bbdd.
-- ============================================================

-- 1) Esquemas de ejemplo completos
DROP SCHEMA IF EXISTS empresa CASCADE;
DROP SCHEMA IF EXISTS tienda CASCADE;
DROP SCHEMA IF EXISTS concesionario CASCADE;

-- 2) Vacía el esquema public sin borrar el propio esquema
DO $$
DECLARE
  obj RECORD;
BEGIN
  -- Tablas (incluye particionadas)
  FOR obj IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', obj.name);
  END LOOP;

  -- Vistas y vistas materializadas
  FOR obj IN
    SELECT c.relname AS name, c.relkind AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    IF obj.kind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', obj.name);
    ELSE
      EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', obj.name);
    END IF;
  END LOOP;

  -- Funciones propias (no de extensiones como pgcrypto/uuid-ossp)
  FOR obj IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', obj.sig);
  END LOOP;
END $$;

-- 3) Tipos/enums propios del esquema public (por si había alguno)
DO $$
DECLARE
  obj RECORD;
BEGIN
  FOR obj IN
    SELECT t.typname AS name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', obj.name);
  END LOOP;
END $$;

-- Listo. El esquema public queda vacío y los 3 esquemas borrados.
