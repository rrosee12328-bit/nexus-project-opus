ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS profitability_sheet_url text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS profitability_sheet_url text;