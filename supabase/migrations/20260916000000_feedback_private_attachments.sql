-- Files are served through an authenticated, owner-checked endpoint.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('feedback-attachments', 'feedback-attachments', false, 10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO UPDATE SET public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.feedback_attachments ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.feedback_attachments ADD COLUMN IF NOT EXISTS file_size bigint;

-- Owners may reply to their own feedback, but cannot impersonate staff.
DROP POLICY IF EXISTS "Users can insert responses on own feedbacks" ON public.feedback_responses;
CREATE POLICY "Users can insert responses on own feedbacks"
ON public.feedback_responses FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND is_admin = false
  AND EXISTS (SELECT 1 FROM public.feedbacks f WHERE f.id = feedback_id AND f.user_id = auth.uid())
);
