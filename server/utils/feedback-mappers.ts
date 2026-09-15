import type { Feedback, TechContext } from "../../app/types/feedback";

type AttachmentRow = {
  id: string;
  feedback_id: string;
  file_name: string;
  file_url: string;
  storage_path?: string | null;
  file_type: string;
  file_size?: number;
  created_at: string;
};
type ResponseRow = {
  id?: string;
  feedback_id: string;
  user_id: string;
  content: string;
  is_admin: boolean;
  created_at: string;
};
type FeedbackRow = {
  id: string;
  user_id: string;
  type: Feedback["type"];
  title: string;
  description: string;
  tech_context: TechContext | null;
  status: Feedback["status"];
  priority: Feedback["priority"];
  created_at: string;
  updated_at: string;
  feedback_attachments?: AttachmentRow[];
  feedback_responses?: ResponseRow[];
};

// PostgREST rows use snake_case; the user interface uses camelCase.
export function mapFeedback(raw: Record<string, unknown>): Feedback {
  const row = raw as FeedbackRow;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    description: row.description,
    techContext: row.tech_context,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: (row.feedback_attachments ?? []).map((file) => ({
      id: file.id,
      feedbackId: file.feedback_id,
      fileName: file.file_name,
      fileUrl: file.storage_path
        ? `/api/feedback/${row.id}/attachments/${file.id}`
        : file.file_url,
      fileType: file.file_type,
      fileSize: file.file_size,
      createdAt: file.created_at,
    })),
    responses: (row.feedback_responses ?? [])
      .filter(
        (response): response is ResponseRow & { id: string } => !!response.id,
      )
      .map((response) => ({
        id: response.id,
        feedbackId: response.feedback_id,
        userId: response.user_id,
        content: response.content,
        isAdmin: response.is_admin,
        createdAt: response.created_at,
      }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}
