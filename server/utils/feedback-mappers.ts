// PostgREST rows use snake_case; the user interface uses camelCase.
export function mapFeedback(row: Record<string, any>) {
  return {
    id: row.id, userId: row.user_id, type: row.type, title: row.title,
    description: row.description, techContext: row.tech_context,
    status: row.status, priority: row.priority,
    createdAt: row.created_at, updatedAt: row.updated_at,
    attachments: (row.feedback_attachments ?? []).map((file: Record<string, any>) => ({
      id: file.id, feedbackId: file.feedback_id, fileName: file.file_name,
      fileUrl: file.storage_path ? `/api/feedback/${row.id}/attachments/${file.id}` : file.file_url,
      fileType: file.file_type, fileSize: file.file_size, createdAt: file.created_at
    })),
    responses: (row.feedback_responses ?? []).filter((response: Record<string, any>) => response.id).map((response: Record<string, any>) => ({
      id: response.id, feedbackId: response.feedback_id, userId: response.user_id,
      content: response.content, isAdmin: response.is_admin, createdAt: response.created_at
    })).sort((a: { createdAt: string }, b: { createdAt: string }) => a.createdAt.localeCompare(b.createdAt))
  }
}
