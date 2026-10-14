DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'production_entry_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.production_entry_participants;
  END IF;
END;
$$;
ALTER TABLE public.production_entry_participants REPLICA IDENTITY FULL;