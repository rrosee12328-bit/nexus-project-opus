
-- Allow ops users to read all profiles (needed for team member dropdowns)
CREATE POLICY "Ops can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ops'));

-- Allow ops users to read all user_roles (needed for assignee lists)
CREATE POLICY "Ops can view all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'ops'));
