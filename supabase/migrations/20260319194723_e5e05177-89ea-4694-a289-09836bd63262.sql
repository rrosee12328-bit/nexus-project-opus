
-- Create SOP category enum
CREATE TYPE public.sop_category AS ENUM ('onboarding', 'operations', 'development', 'design', 'communication', 'finance', 'general');

-- Create SOPs table
CREATE TABLE public.sops (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  category sop_category NOT NULL DEFAULT 'general',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;

-- Admins can manage SOPs
CREATE POLICY "Admins can manage sops" ON public.sops FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Ops can view SOPs
CREATE POLICY "Ops can view sops" ON public.sops FOR SELECT USING (has_role(auth.uid(), 'ops'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_sops_updated_at BEFORE UPDATE ON public.sops FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
