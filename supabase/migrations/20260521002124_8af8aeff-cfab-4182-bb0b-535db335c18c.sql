-- Add image_url to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS image_url text;

-- Create public storage bucket for item photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('item-photos', 'item-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public can view item photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'item-photos');

CREATE POLICY "Authenticated can upload item photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'item-photos');

CREATE POLICY "Authenticated can update item photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'item-photos');

CREATE POLICY "Authenticated can delete item photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'item-photos');