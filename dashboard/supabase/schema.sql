-- ============================================================
-- D&C Scale — Schema completo
-- Versión: 1.0 · Abril 2026
-- ============================================================
-- IMPORTANTE: este script es idempotente. Podés correrlo múltiples
-- veces sin romper nada — hace DROP antes de CREATE.
-- ============================================================

-- ==================== EXTENSIONS ====================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==================== PROFILES (extiende auth.users) ====================
-- Cada usuario autenticado tiene un profile con metadatos del equipo.
-- Se crea automáticamente via trigger cuando alguien se registra.

DROP TABLE IF EXISTS public.profiles CASCADE;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'team' CHECK (role IN ('director', 'team')),
  initials text NOT NULL DEFAULT '??',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_role_idx ON public.profiles(role);

-- Trigger: al crearse un auth.user, crear el profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, initials)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    UPPER(SUBSTRING(COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 1, 2))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==================== CLIENTS ====================

DROP TABLE IF EXISTS public.clients CASCADE;
CREATE TABLE public.clients (
  id text PRIMARY KEY,                          -- slug "realvalue-propiedades"
  initials text NOT NULL,
  name text NOT NULL,
  sector text NOT NULL,
  type text NOT NULL CHECK (type IN ('gp', 'dev')),
  status text NOT NULL CHECK (status IN ('active', 'onboarding', 'dev')),
  phase text NOT NULL,
  fee numeric(10,2) NOT NULL DEFAULT 0,
  method text NOT NULL,
  modules jsonb DEFAULT '{}'::jsonb,             -- {meta: true, google: true, ...}
  kpis jsonb DEFAULT '{}'::jsonb,                -- {roas, leads, cac, ...}
  progress integer,                              -- solo para dev
  sprints jsonb,                                 -- [{name, status}, ...] solo dev
  fee_variable text,                             -- descripción del variable
  contact_name text,
  contact_email text,
  contact_phone text,
  country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX clients_type_idx ON public.clients(type);
CREATE INDEX clients_status_idx ON public.clients(status);

-- ==================== LEADS (Pipeline CRM) ====================

DROP TABLE IF EXISTS public.leads CASCADE;
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  company text NOT NULL,
  sector text NOT NULL DEFAULT '—',
  type text NOT NULL CHECK (type IN ('gp', 'dev')),
  value numeric(10,2) NOT NULL DEFAULT 0,
  stage text NOT NULL CHECK (stage IN ('prospecto', 'contacto', 'propuesta', 'negociacion', 'cerrado')),
  source text NOT NULL CHECK (source IN ('linkedin', 'email', 'manual', 'referido')),
  note text,
  meeting_booked boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_stage_idx ON public.leads(stage);

-- ==================== PROSPECT CAMPAIGNS ====================

DROP TABLE IF EXISTS public.prospect_campaigns CASCADE;
CREATE TABLE public.prospect_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text NOT NULL,
  demographics text NOT NULL,
  client_type text NOT NULL,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,  -- ["LinkedIn", "Email"]
  status text NOT NULL CHECK (status IN ('active', 'paused')),
  leads_found integer NOT NULL DEFAULT 0,
  contacted integer NOT NULL DEFAULT 0,
  replied integer NOT NULL DEFAULT 0,
  meetings integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ==================== CALENDAR EVENTS ====================

DROP TABLE IF EXISTS public.cal_events CASCADE;
CREATE TABLE public.cal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL CHECK (type IN ('reunion', 'cobro', 'reporte', 'dev', 'contenido')),
  date date NOT NULL,
  time text NOT NULL DEFAULT '10:00',
  duration integer NOT NULL DEFAULT 60,
  client_id text REFERENCES public.clients(id) ON DELETE SET NULL,
  client_label text NOT NULL,
  participants text,
  notes text,
  meet_link text,
  synced boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cal_events_date_idx ON public.cal_events(date);
CREATE INDEX cal_events_client_idx ON public.cal_events(client_id);

-- ==================== EXPENSES ====================

DROP TABLE IF EXISTS public.expenses CASCADE;
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  concept text NOT NULL,
  category text NOT NULL CHECK (category IN ('equipo', 'tools', 'ia', 'produccion', 'otros')),
  assigned_to text NOT NULL DEFAULT 'Interno',
  amount numeric(10,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX expenses_date_idx ON public.expenses(date);
CREATE INDEX expenses_category_idx ON public.expenses(category);

-- ==================== PAYMENTS (Facturación) ====================

DROP TABLE IF EXISTS public.payments CASCADE;
CREATE TABLE public.payments (
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  month text NOT NULL,                          -- YYYY-MM
  status text NOT NULL CHECK (status IN ('paid', 'pending', 'late')),
  paid_date timestamptz,
  PRIMARY KEY (client_id, month)
);

-- ==================== OBJECTIVES (1:1 con client) ====================

DROP TABLE IF EXISTS public.objectives CASCADE;
CREATE TABLE public.objectives (
  client_id text PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  period text NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'semester', 'annual')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,    -- [{id, name, now, target, unit, pct}]
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL DEFAULT ''
);

-- ==================== NOTES ====================

DROP TABLE IF EXISTS public.notes CASCADE;
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notes_client_idx ON public.notes(client_id);

-- ==================== DEV TASKS ====================

DROP TABLE IF EXISTS public.dev_tasks CASCADE;
CREATE TABLE public.dev_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sprint text,
  title text NOT NULL,
  description text,
  assignee text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('baja', 'media', 'alta', 'critica')),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'done')),
  type text,
  estimated_hours integer,
  start_date date,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dev_tasks_client_idx ON public.dev_tasks(client_id);
CREATE INDEX dev_tasks_status_idx ON public.dev_tasks(status);

-- ==================== PRODUCTION CAMPAIGNS ====================

DROP TABLE IF EXISTS public.production_campaigns CASCADE;
CREATE TABLE public.production_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'done')),
  budget numeric(10,2) NOT NULL DEFAULT 0,
  spent numeric(10,2) NOT NULL DEFAULT 0,
  has_result boolean DEFAULT false,
  items jsonb DEFAULT '[]'::jsonb,               -- [{label, amount}]
  start_date date,
  end_date date,
  result_files integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX prod_campaigns_client_idx ON public.production_campaigns(client_id);

-- ==================== CONTENT POSTS (Planificador) ====================

DROP TABLE IF EXISTS public.content_posts CASCADE;
CREATE TABLE public.content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  date date NOT NULL,
  time text NOT NULL DEFAULT '19:00',
  network text NOT NULL CHECK (network IN ('ig', 'tt', 'in', 'fb')),
  format text NOT NULL CHECK (format IN ('reel', 'post', 'carrusel', 'story')),
  brief text NOT NULL,
  copy text,
  status text NOT NULL CHECK (status IN ('draft', 'scheduled', 'published')),
  source text NOT NULL CHECK (source IN ('ai', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_client_date_idx ON public.content_posts(client_id, date);

-- ==================== ROUTING RULES ====================

DROP TABLE IF EXISTS public.routing_rules CASCADE;
CREATE TABLE public.routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  task text NOT NULL,
  executor text NOT NULL,
  condition text NOT NULL DEFAULT 'Siempre',
  requires_auth boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX routing_client_idx ON public.routing_rules(client_id);

-- ==================== INTEGRATIONS (per client) ====================

DROP TABLE IF EXISTS public.integrations CASCADE;
CREATE TABLE public.integrations (
  id text NOT NULL,                             -- e.g. "meta_ads"
  client_id text NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  group_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('connected', 'pending', 'disconnected')),
  account text,
  PRIMARY KEY (client_id, id)
);

-- ============================================================
-- RLS POLICIES
-- ============================================================
-- MVP: cualquier usuario autenticado puede leer/escribir.
-- Más adelante afinamos por rol (director vs team, cliente específico, etc.)
-- ============================================================

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_campaigns    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cal_events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objectives            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_posts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_rules         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations          ENABLE ROW LEVEL SECURITY;

-- Macro para simplificar la creación de policies
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'profiles', 'clients', 'leads', 'prospect_campaigns',
      'cal_events', 'expenses', 'payments', 'objectives',
      'notes', 'dev_tasks', 'production_campaigns',
      'content_posts', 'routing_rules', 'integrations'
    ])
  LOOP
    -- Drop existing policies (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', tbl, tbl);

    -- Create permissive policies for authenticated users
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated USING (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', tbl, tbl);
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (true)', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- DONE
-- ============================================================
-- Ejecutá:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- Deberías ver: cal_events, clients, content_posts, dev_tasks,
-- expenses, integrations, leads, notes, objectives, payments,
-- production_campaigns, profiles, prospect_campaigns, routing_rules.
-- ============================================================
