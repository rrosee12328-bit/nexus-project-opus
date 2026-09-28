-- Usage metadata only. Prompts, transcripts, and generated content do not belong here.
ALTER TABLE public.call_intelligence ADD COLUMN IF NOT EXISTS analysis_pending boolean NOT NULL DEFAULT false;

-- Stable source keys make analysis side effects safe to replay after partial failures.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS ai_source_key text;
ALTER TABLE public.client_notes ADD COLUMN IF NOT EXISTS ai_source_key text;
ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS ai_source_key text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS ai_source_key text;
ALTER TABLE public.company_summaries ADD COLUMN IF NOT EXISTS ai_source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_ai_source_key_unique ON public.tasks(ai_source_key);
CREATE UNIQUE INDEX IF NOT EXISTS client_notes_ai_source_key_unique ON public.client_notes(ai_source_key);
CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_ai_source_key_unique ON public.approval_requests(ai_source_key);
CREATE UNIQUE INDEX IF NOT EXISTS notifications_ai_source_key_unique ON public.notifications(ai_source_key);
CREATE UNIQUE INDEX IF NOT EXISTS company_summaries_ai_source_key_unique ON public.company_summaries(ai_source_key);
CREATE TABLE public.ai_monthly_budgets (
  month date NOT NULL,
  category text NOT NULL CHECK (category IN ('background', 'interactive')),
  allowance numeric(12,6) NOT NULL,
  spent numeric(12,6) NOT NULL DEFAULT 0,
  reserved numeric(12,6) NOT NULL DEFAULT 0,
  PRIMARY KEY (month, category)
);
CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL,
  category text NOT NULL,
  feature text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'rejected', 'uncertain')),
  reserved_cost numeric(12,6) NOT NULL,
  estimated_cost numeric(12,6),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  FOREIGN KEY (month, category) REFERENCES public.ai_monthly_budgets(month, category)
);
CREATE TABLE public.ai_budget_alerts (
  month date NOT NULL,
  category text NOT NULL,
  threshold integer NOT NULL CHECK (threshold IN (80,100)),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(month,category,threshold)
);
-- Generated responses are separate from usage logs and inaccessible to browser roles.
CREATE TABLE public.ai_result_cache (
  fingerprint text PRIMARY KEY,
  feature text NOT NULL,
  claim_id uuid NOT NULL DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_monthly_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_budget_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_result_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_monthly_budgets,public.ai_usage,public.ai_budget_alerts,public.ai_result_cache FROM anon,authenticated;
GRANT SELECT ON public.ai_monthly_budgets,public.ai_usage,public.ai_budget_alerts TO authenticated;
GRANT ALL ON public.ai_monthly_budgets,public.ai_usage,public.ai_budget_alerts,public.ai_result_cache TO service_role;
CREATE POLICY "Staff read AI budgets" ON public.ai_monthly_budgets FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','ops')));
CREATE POLICY "Staff read AI usage" ON public.ai_usage FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','ops')));
CREATE POLICY "Staff read AI alerts" ON public.ai_budget_alerts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','ops')));

CREATE FUNCTION public.ai_budget_alert(p_month date,p_category text,p_threshold integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO ai_budget_alerts(month,category,threshold) VALUES(p_month,p_category,p_threshold) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    INSERT INTO notifications(user_id,title,body,type,link)
    SELECT DISTINCT user_id,'AI allowance: ' || p_threshold || '%',
      p_category || ' estimated monthly AI allowance has reached its warning or stopping point. Core portal features are unaffected.',
      'system','/admin'
    FROM user_roles WHERE role IN ('admin','ops');
  END IF;
END;
$$;

CREATE FUNCTION public.reserve_ai_cost(p_category text,p_feature text,p_model text,p_cost numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m date := date_trunc('month',now() AT TIME ZONE 'America/Chicago')::date; b ai_monthly_budgets; request_id uuid;
BEGIN
  IF p_category NOT IN ('background','interactive') OR p_cost IS NULL OR p_cost<=0 OR p_cost>1 THEN
    RAISE EXCEPTION 'Invalid AI reservation';
  END IF;
  INSERT INTO ai_monthly_budgets(month,category,allowance) VALUES(m,p_category,CASE WHEN p_category='background' THEN 10 ELSE 15 END) ON CONFLICT DO NOTHING;
  SELECT * INTO b FROM ai_monthly_budgets WHERE month=m AND category=p_category FOR UPDATE;
  IF b.spent+b.reserved+p_cost>b.allowance THEN
    PERFORM ai_budget_alert(m,p_category,100);
    RETURN jsonb_build_object('allowed',false,'reason','monthly_budget');
  END IF;
  UPDATE ai_monthly_budgets SET reserved=reserved+p_cost WHERE month=m AND category=p_category;
  INSERT INTO ai_usage(month,category,feature,model,reserved_cost) VALUES(m,p_category,p_feature,p_model,p_cost) RETURNING id INTO request_id;
  IF b.spent+b.reserved+p_cost>=b.allowance*0.8 THEN PERFORM ai_budget_alert(m,p_category,80); END IF;
  IF b.spent+b.reserved+p_cost>=b.allowance THEN PERFORM ai_budget_alert(m,p_category,100); END IF;
  RETURN jsonb_build_object('allowed',true,'id',request_id);
END;
$$;

CREATE FUNCTION public.settle_ai_cost(p_id uuid,p_status text,p_cost numeric,p_input integer DEFAULT NULL,p_output integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u ai_usage; b ai_monthly_budgets;
BEGIN
  IF p_status NOT IN ('completed','rejected','uncertain') OR p_cost IS NULL OR p_cost<0 THEN RAISE EXCEPTION 'Invalid AI settlement'; END IF;
  SELECT * INTO u FROM ai_usage WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR u.status<>'reserved' THEN RETURN; END IF;
  -- Unknown provider outcomes keep the full reservation charged conservatively.
  IF p_status='uncertain' THEN p_cost:=u.reserved_cost; END IF;
  IF p_status='rejected' THEN p_cost:=0; END IF;
  UPDATE ai_monthly_budgets SET reserved=greatest(0,reserved-u.reserved_cost),spent=spent+p_cost WHERE month=u.month AND category=u.category RETURNING * INTO b;
  UPDATE ai_usage SET status=p_status,estimated_cost=p_cost,input_tokens=p_input,output_tokens=p_output,settled_at=now() WHERE id=p_id;
  IF b.spent+b.reserved>=b.allowance*0.8 THEN PERFORM ai_budget_alert(u.month,u.category,80); END IF;
  IF b.spent+b.reserved>=b.allowance THEN PERFORM ai_budget_alert(u.month,u.category,100); END IF;
END;
$$;

CREATE FUNCTION public.claim_ai_result(p_fingerprint text,p_feature text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r ai_result_cache;
BEGIN
  INSERT INTO ai_result_cache(fingerprint,feature) VALUES(p_fingerprint,p_feature) ON CONFLICT DO NOTHING RETURNING * INTO r;
  IF FOUND THEN RETURN jsonb_build_object('status','claimed','claim_id',r.claim_id); END IF;
  SELECT * INTO r FROM ai_result_cache WHERE fingerprint=p_fingerprint FOR UPDATE;
  IF r.status='completed' THEN RETURN jsonb_build_object('status','cached','result',r.result); END IF;
  IF r.status='failed' THEN
    UPDATE ai_result_cache SET status='processing',claim_id=gen_random_uuid(),updated_at=now() WHERE fingerprint=p_fingerprint RETURNING * INTO r;
    RETURN jsonb_build_object('status','claimed','claim_id',r.claim_id);
  END IF;
  -- Do not expire unknown in-flight requests automatically and pay for them twice.
  RETURN jsonb_build_object('status','busy');
END;
$$;
REVOKE ALL ON FUNCTION public.ai_budget_alert(date,text,integer),public.reserve_ai_cost(text,text,text,numeric),public.settle_ai_cost(uuid,text,numeric,integer,integer),public.claim_ai_result(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_budget_alert(date,text,integer),public.reserve_ai_cost(text,text,text,numeric),public.settle_ai_cost(uuid,text,numeric,integer,integer),public.claim_ai_result(text,text) TO service_role;
