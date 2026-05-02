-- 1. business_settings (single-row key/value)
CREATE TABLE IF NOT EXISTS public.business_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_hourly_cost numeric NOT NULL DEFAULT 125,
  target_margin_pct numeric NOT NULL DEFAULT 50,
  low_margin_threshold_pct numeric NOT NULL DEFAULT 20,
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

INSERT INTO public.business_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage business settings"
ON public.business_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ops can read business settings"
ON public.business_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Service role full access business settings"
ON public.business_settings FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2. Add client_id, project_id to time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_client ON public.time_entries(client_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON public.time_entries(project_id, entry_date);

-- 3. Profitability view (live)
CREATE OR REPLACE VIEW public.v_client_profitability AS
WITH settings AS (
  SELECT internal_hourly_cost FROM public.business_settings LIMIT 1
),
months AS (
  SELECT
    generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    )::date AS month_start
),
client_months AS (
  SELECT c.id AS client_id, c.name AS client_name, m.month_start
  FROM public.clients c
  CROSS JOIN months m
),
revenue AS (
  SELECT
    client_id,
    make_date(payment_year, payment_month, 1) AS month_start,
    SUM(amount)::numeric AS revenue
  FROM public.client_payments
  GROUP BY client_id, make_date(payment_year, payment_month, 1)
),
te_hours AS (
  SELECT
    client_id,
    date_trunc('month', entry_date)::date AS month_start,
    SUM(hours)::numeric AS hours
  FROM public.time_entries
  WHERE client_id IS NOT NULL
  GROUP BY client_id, date_trunc('month', entry_date)::date
),
cal_hours AS (
  SELECT
    client_id,
    date_trunc('month', event_date)::date AS month_start,
    SUM(
      CASE
        WHEN start_time IS NOT NULL AND end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
        ELSE 0
      END
    )::numeric AS hours
  FROM public.calendar_events
  WHERE billable = true AND client_id IS NOT NULL
  GROUP BY client_id, date_trunc('month', event_date)::date
),
external_costs AS (
  SELECT
    client_id,
    -- monthly costs apply each month; one-time costs apply only to current month
    date_trunc('month', now())::date AS month_start,
    SUM(amount)::numeric AS cost
  FROM public.client_costs
  WHERE is_monthly = true
  GROUP BY client_id
)
SELECT
  cm.client_id,
  cm.client_name,
  cm.month_start,
  COALESCE(r.revenue, 0) AS revenue,
  COALESCE(te.hours, 0) + COALESCE(ch.hours, 0) AS hours,
  ((COALESCE(te.hours, 0) + COALESCE(ch.hours, 0)) * (SELECT internal_hourly_cost FROM settings))::numeric AS labor_cost,
  COALESCE(ec.cost, 0) AS external_cost,
  (COALESCE(r.revenue, 0)
    - ((COALESCE(te.hours, 0) + COALESCE(ch.hours, 0)) * (SELECT internal_hourly_cost FROM settings))
    - COALESCE(ec.cost, 0))::numeric AS profit,
  CASE
    WHEN COALESCE(r.revenue, 0) > 0 THEN
      ROUND(
        ((COALESCE(r.revenue, 0)
          - ((COALESCE(te.hours, 0) + COALESCE(ch.hours, 0)) * (SELECT internal_hourly_cost FROM settings))
          - COALESCE(ec.cost, 0)
        ) / COALESCE(r.revenue, 0) * 100)::numeric,
        1
      )
    ELSE NULL
  END AS margin_pct
FROM client_months cm
LEFT JOIN revenue r ON r.client_id = cm.client_id AND r.month_start = cm.month_start
LEFT JOIN te_hours te ON te.client_id = cm.client_id AND te.month_start = cm.month_start
LEFT JOIN cal_hours ch ON ch.client_id = cm.client_id AND ch.month_start = cm.month_start
LEFT JOIN external_costs ec ON ec.client_id = cm.client_id AND ec.month_start = cm.month_start;

-- 4. ai_decision_queue
CREATE TABLE IF NOT EXISTS public.ai_decision_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  body text,
  recommendation text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_tier text NOT NULL DEFAULT 'low' CHECK (risk_tier IN ('low','medium','high')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','auto_executed','dismissed')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  link text,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_decision_queue_status ON public.ai_decision_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decision_queue_client ON public.ai_decision_queue(client_id);

ALTER TABLE public.ai_decision_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage decision queue"
ON public.ai_decision_queue FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Ops view decision queue"
ON public.ai_decision_queue FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'ops'::app_role));

CREATE POLICY "Service role full access decision queue"
ON public.ai_decision_queue FOR ALL TO public
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER update_ai_decision_queue_updated_at
BEFORE UPDATE ON public.ai_decision_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_business_settings_updated_at
BEFORE UPDATE ON public.business_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();