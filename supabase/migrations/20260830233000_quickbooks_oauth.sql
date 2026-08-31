CREATE TABLE public.quickbooks_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  realm_id TEXT NOT NULL,
  company_name TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  connected_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (environment, realm_id)
);

CREATE TABLE public.quickbooks_oauth_states (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  state TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  redirect_to TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.quickbooks_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quickbooks_oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_quickbooks_connections_updated_at
  BEFORE UPDATE ON public.quickbooks_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins can view QuickBooks connections"
ON public.quickbooks_connections
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage QuickBooks connections"
ON public.quickbooks_connections
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can create their own QuickBooks OAuth states"
ON public.quickbooks_oauth_states
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can view their own QuickBooks OAuth states"
ON public.quickbooks_oauth_states
FOR SELECT
USING (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete their own QuickBooks OAuth states"
ON public.quickbooks_oauth_states
FOR DELETE
USING (
  user_id = auth.uid()
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

