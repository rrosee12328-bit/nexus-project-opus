ALTER TABLE public.market_intelligence REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_intelligence;