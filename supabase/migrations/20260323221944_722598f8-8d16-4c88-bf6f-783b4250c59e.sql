
CREATE TABLE public.company_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  summary_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NOT NULL
);

ALTER TABLE public.company_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage summaries" ON public.company_summaries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Ops can view summaries" ON public.company_summaries
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'ops'));
