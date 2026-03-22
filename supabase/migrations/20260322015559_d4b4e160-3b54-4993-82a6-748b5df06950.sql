
-- Remove overly permissive anon update policy - signing will happen via edge function with service role
DROP POLICY "Anon can update proposals for signing" ON public.proposals;
