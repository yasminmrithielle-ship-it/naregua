ALTER TABLE public.barbershops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbershop_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_self_read" ON public.users;
CREATE POLICY "users_self_read"
ON public.users
FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS "users_self_update" ON public.users;
CREATE POLICY "users_self_update"
ON public.users
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "barbershops_member_read" ON public.barbershops;
CREATE POLICY "barbershops_member_read"
ON public.barbershops
FOR SELECT
TO authenticated
USING (id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "barbershops_owner_update" ON public.barbershops;
CREATE POLICY "barbershops_owner_update"
ON public.barbershops
FOR UPDATE
TO authenticated
USING (public.current_user_has_role(id, ARRAY['owner', 'admin']))
WITH CHECK (public.current_user_has_role(id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "barbershop_users_member_read" ON public.barbershop_users;
CREATE POLICY "barbershop_users_member_read"
ON public.barbershop_users
FOR SELECT
TO authenticated
USING (barbershop_id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "barbershop_users_owner_manage" ON public.barbershop_users;
CREATE POLICY "barbershop_users_owner_manage"
ON public.barbershop_users
FOR ALL
TO authenticated
USING (public.current_user_has_role(barbershop_id, ARRAY['owner']))
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner']));

DROP POLICY IF EXISTS "barbers_member_read" ON public.barbers;
CREATE POLICY "barbers_member_read"
ON public.barbers
FOR SELECT
TO authenticated
USING (barbershop_id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "barbers_admin_write" ON public.barbers;
CREATE POLICY "barbers_admin_write"
ON public.barbers
FOR ALL
TO authenticated
USING (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']))
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "services_member_read" ON public.services;
CREATE POLICY "services_member_read"
ON public.services
FOR SELECT
TO authenticated
USING (barbershop_id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "services_admin_write" ON public.services;
CREATE POLICY "services_admin_write"
ON public.services
FOR ALL
TO authenticated
USING (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']))
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "customers_member_read" ON public.customers;
CREATE POLICY "customers_member_read"
ON public.customers
FOR SELECT
TO authenticated
USING (barbershop_id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "customers_team_write" ON public.customers;
CREATE POLICY "customers_team_write"
ON public.customers
FOR ALL
TO authenticated
USING (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin', 'attendant']))
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin', 'attendant']));

DROP POLICY IF EXISTS "appointments_member_read" ON public.appointments;
CREATE POLICY "appointments_member_read"
ON public.appointments
FOR SELECT
TO authenticated
USING (barbershop_id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "appointments_team_write" ON public.appointments;
CREATE POLICY "appointments_team_write"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin', 'attendant', 'barber']));

DROP POLICY IF EXISTS "appointments_team_update" ON public.appointments;
CREATE POLICY "appointments_team_update"
ON public.appointments
FOR UPDATE
TO authenticated
USING (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin', 'attendant', 'barber']))
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin', 'attendant', 'barber']));

DROP POLICY IF EXISTS "working_hours_member_read" ON public.working_hours;
CREATE POLICY "working_hours_member_read"
ON public.working_hours
FOR SELECT
TO authenticated
USING (barbershop_id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "working_hours_admin_write" ON public.working_hours;
CREATE POLICY "working_hours_admin_write"
ON public.working_hours
FOR ALL
TO authenticated
USING (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']))
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "chatbot_settings_member_read" ON public.chatbot_settings;
CREATE POLICY "chatbot_settings_member_read"
ON public.chatbot_settings
FOR SELECT
TO authenticated
USING (barbershop_id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "chatbot_settings_admin_write" ON public.chatbot_settings;
CREATE POLICY "chatbot_settings_admin_write"
ON public.chatbot_settings
FOR ALL
TO authenticated
USING (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']))
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']));

DROP POLICY IF EXISTS "whatsapp_connections_member_read" ON public.whatsapp_connections;
CREATE POLICY "whatsapp_connections_member_read"
ON public.whatsapp_connections
FOR SELECT
TO authenticated
USING (barbershop_id IN (SELECT public.current_user_barbershop_ids()));

DROP POLICY IF EXISTS "whatsapp_connections_admin_write" ON public.whatsapp_connections;
CREATE POLICY "whatsapp_connections_admin_write"
ON public.whatsapp_connections
FOR ALL
TO authenticated
USING (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']))
WITH CHECK (public.current_user_has_role(barbershop_id, ARRAY['owner', 'admin']));
