-- 1) Enum de perfis
CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');

-- 2) Tabela user_roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Função has_role (security definer evita recursão em RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4) RLS de user_roles
CREATE POLICY "Auth users can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage roles - insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles - update" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles - delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 5) Trigger: novo usuário entra como viewer
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_role
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- 6) Promove TODOS os usuários atuais a admin (assim ninguém perde acesso agora;
--    você revoga depois pela tela de Usuários)
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users
ON CONFLICT DO NOTHING;

-- 7) Substituir policies de escrita das tabelas de dados para exigir admin
-- ITEMS
DROP POLICY IF EXISTS "Authenticated can insert items" ON public.items;
DROP POLICY IF EXISTS "Authenticated can update items" ON public.items;
DROP POLICY IF EXISTS "Authenticated can delete items" ON public.items;
CREATE POLICY "Admins insert items" ON public.items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update items" ON public.items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete items" ON public.items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- MOVEMENTS
DROP POLICY IF EXISTS "Authenticated can insert movements" ON public.movements;
DROP POLICY IF EXISTS "Authenticated can update movements" ON public.movements;
DROP POLICY IF EXISTS "Authenticated can delete movements" ON public.movements;
CREATE POLICY "Admins insert movements" ON public.movements FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update movements" ON public.movements FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete movements" ON public.movements FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- OBRAS
DROP POLICY IF EXISTS "Authenticated can insert obras" ON public.obras;
DROP POLICY IF EXISTS "Authenticated can update obras" ON public.obras;
DROP POLICY IF EXISTS "Authenticated can delete obras" ON public.obras;
CREATE POLICY "Admins insert obras" ON public.obras FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update obras" ON public.obras FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete obras" ON public.obras FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- OBRA_ITEMS
DROP POLICY IF EXISTS "Authenticated can insert obra_items" ON public.obra_items;
DROP POLICY IF EXISTS "Authenticated can update obra_items" ON public.obra_items;
DROP POLICY IF EXISTS "Authenticated can delete obra_items" ON public.obra_items;
CREATE POLICY "Admins insert obra_items" ON public.obra_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update obra_items" ON public.obra_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete obra_items" ON public.obra_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- OBRA_EXTRAS
DROP POLICY IF EXISTS "Authenticated can insert obra_extras" ON public.obra_extras;
DROP POLICY IF EXISTS "Authenticated can update obra_extras" ON public.obra_extras;
DROP POLICY IF EXISTS "Authenticated can delete obra_extras" ON public.obra_extras;
CREATE POLICY "Admins insert obra_extras" ON public.obra_extras FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update obra_extras" ON public.obra_extras FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete obra_extras" ON public.obra_extras FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- RENTALS
DROP POLICY IF EXISTS "Authenticated can insert rentals" ON public.rentals;
DROP POLICY IF EXISTS "Authenticated can update rentals" ON public.rentals;
DROP POLICY IF EXISTS "Authenticated can delete rentals" ON public.rentals;
CREATE POLICY "Admins insert rentals" ON public.rentals FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update rentals" ON public.rentals FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete rentals" ON public.rentals FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 8) View que junta usuário + email para admins listarem (security_invoker)
CREATE OR REPLACE VIEW public.users_with_roles WITH (security_invoker=on) AS
SELECT u.id AS user_id, u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email) AS display_name,
  ARRAY(SELECT role::text FROM public.user_roles WHERE user_id = u.id) AS roles,
  u.created_at
FROM auth.users u;
GRANT SELECT ON public.users_with_roles TO authenticated;