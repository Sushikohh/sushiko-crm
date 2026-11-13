-- Volltextsuche (deutsch) für Unternehmen und Ansprechpartner
CREATE OR REPLACE FUNCTION public.company_fts(name text, street text, district text, postal_code text, notes text, tags text[])
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('german'::regconfig, coalesce(name,'') || ' ' || coalesce(street,'') || ' ' || coalesce(district,'') || ' ' || coalesce(postal_code,'') || ' ' || coalesce(notes,'') || ' ' || coalesce(array_to_string(tags, ' '),''))
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.contact_fts(p_first text, p_last text, p_email text, p_position text, p_notes text)
RETURNS tsvector LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_tsvector('german'::regconfig, coalesce(p_first,'') || ' ' || coalesce(p_last,'') || ' ' || coalesce(p_email,'') || ' ' || coalesce(p_position,'') || ' ' || coalesce(p_notes,''))
$$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_fts_idx" ON "companies" USING gin (public.company_fts(name, street, district, postal_code, notes, tags));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_fts_idx" ON "contacts" USING gin (public.contact_fts(first_name, last_name, email, position, notes));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_tags_idx" ON "companies" USING gin (tags);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_tags_idx" ON "contacts" USING gin (tags);--> statement-breakpoint

-- Offerten-Nummernkreis
CREATE SEQUENCE IF NOT EXISTS offer_number_seq START 1000;--> statement-breakpoint

-- ------------------------------------------------------------------
-- Row Level Security (Supabase)
-- Der Anwendungsserver verbindet sich mit der Service-Rolle (Tabelleneigentümer) und
-- umgeht RLS. Für Zugriffe über die Supabase-API (anon/authenticated) gilt:
-- nur aktive Teammitglieder; anonyme Zugriffe sind vollständig gesperrt.
-- Auf einem reinen PostgreSQL ohne Supabase-Rollen wird nur RLS aktiviert.
-- ------------------------------------------------------------------
DO $$
DECLARE
  t text;
  has_supabase boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
                          AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth');
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','companies','company_locations','contacts','email_permissions','permission_events','suppressions',
    'mailboxes','campaigns','campaign_steps','campaign_recipients','email_messages','email_events','deals','tasks',
    'appointments','offers','contracts','activities','automations','automation_runs','notifications','app_settings','audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  IF has_supabase THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.is_team_member() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $b$
        SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active)
      $b$;
    $f$;
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $b$
        SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active AND p.role = 'admin')
      $b$;
    $f$;

    -- Allgemeine CRM-Daten: Lesen/Schreiben für Teammitglieder
    FOREACH t IN ARRAY ARRAY[
      'companies','company_locations','contacts','campaigns','campaign_steps','campaign_recipients','email_messages',
      'email_events','deals','tasks','appointments','offers','contracts','activities','automation_runs'
    ] LOOP
      EXECUTE format('DROP POLICY IF EXISTS team_all ON public.%I', t);
      EXECUTE format('CREATE POLICY team_all ON public.%I FOR ALL TO authenticated USING (public.is_team_member()) WITH CHECK (public.is_team_member())', t);
    END LOOP;

    -- Rechtlich sensible Daten: Lesen für Team, Ändern nur über den Server (Protokollierung)
    FOREACH t IN ARRAY ARRAY['email_permissions','permission_events','suppressions','audit_log'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS team_read ON public.%I', t);
      EXECUTE format('CREATE POLICY team_read ON public.%I FOR SELECT TO authenticated USING (public.is_team_member())', t);
    END LOOP;

    -- Konfiguration: nur Admins (Postfach-Zugangsdaten sind zusätzlich verschlüsselt)
    FOREACH t IN ARRAY ARRAY['mailboxes','automations','app_settings'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS admin_all ON public.%I', t);
      EXECUTE format('CREATE POLICY admin_all ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t);
    END LOOP;

    DROP POLICY IF EXISTS own_profile ON public.profiles;
    CREATE POLICY own_profile ON public.profiles FOR SELECT TO authenticated USING (public.is_team_member());
    DROP POLICY IF EXISTS own_profile_update ON public.profiles;
    CREATE POLICY own_profile_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

    DROP POLICY IF EXISTS own_notifications ON public.notifications;
    CREATE POLICY own_notifications ON public.notifications FOR ALL TO authenticated
      USING (public.is_team_member() AND (user_id IS NULL OR user_id = auth.uid()))
      WITH CHECK (public.is_team_member() AND (user_id IS NULL OR user_id = auth.uid()));

    -- Profil automatisch bei Registrierung in Supabase Auth anlegen (erster Benutzer = Admin)
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $b$
      BEGIN
        INSERT INTO public.profiles (id, email, full_name, role)
        VALUES (NEW.id, lower(NEW.email), coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
                CASE WHEN EXISTS (SELECT 1 FROM public.profiles) THEN 'member'::user_role ELSE 'admin'::user_role END)
        ON CONFLICT (email) DO UPDATE SET id = EXCLUDED.id;
        RETURN NEW;
      END
      $b$;
    $f$;
    DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

  END IF;
END $$;
