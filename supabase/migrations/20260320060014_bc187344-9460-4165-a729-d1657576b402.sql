
-- Create time entry categories enum
CREATE TYPE public.time_entry_category AS ENUM (
  'client_work', 'sales', 'admin', 'vektiss', 'break', 'meeting', 'other'
);

-- Create time_entries table
CREATE TABLE public.time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  day_of_week TEXT NOT NULL DEFAULT '',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  hours NUMERIC(5,2) NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  category time_entry_category NOT NULL DEFAULT 'other',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Admins can manage all time entries
CREATE POLICY "Admins can manage time entries"
  ON public.time_entries FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Ops users can manage their own time entries
CREATE POLICY "Ops can manage own time entries"
  ON public.time_entries FOR ALL
  TO public
  USING (has_role(auth.uid(), 'ops'::app_role) AND user_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'ops'::app_role) AND user_id = auth.uid());

-- Ops users can view all time entries (to see team members)
CREATE POLICY "Ops can view all time entries"
  ON public.time_entries FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'ops'::app_role));

-- Add updated_at trigger
CREATE TRIGGER update_time_entries_updated_at
  BEFORE UPDATE ON public.time_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
