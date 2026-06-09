-- Bucket for Notion-style editor uploads.
-- Files are stored under: {user_id}/editor/{year}/{month}/{uuid}-{filename}

INSERT INTO storage.buckets (id, name, public)
VALUES ('editor-uploads', 'editor-uploads', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Editor uploads are publicly readable'
  ) THEN
    CREATE POLICY "Editor uploads are publicly readable"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'editor-uploads');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can upload editor files to own folder'
  ) THEN
    CREATE POLICY "Users can upload editor files to own folder"
      ON storage.objects
      FOR INSERT
      WITH CHECK (
        bucket_id = 'editor-uploads'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can update own editor files'
  ) THEN
    CREATE POLICY "Users can update own editor files"
      ON storage.objects
      FOR UPDATE
      USING (
        bucket_id = 'editor-uploads'
        AND auth.uid()::text = (storage.foldername(name))[1]
      )
      WITH CHECK (
        bucket_id = 'editor-uploads'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Users can delete own editor files'
  ) THEN
    CREATE POLICY "Users can delete own editor files"
      ON storage.objects
      FOR DELETE
      USING (
        bucket_id = 'editor-uploads'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
