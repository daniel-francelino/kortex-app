// ─── Enums ────────────────────────────────────────────────────────────────────

export enum NoteType {
  Note = 'note',
  Idea = 'idea',
  Concept = 'concept',
  Research = 'research',
  BookNote = 'book_note'
}

export enum NoteVisibility {
  Private = 'private',
  Shared = 'shared',
  Public = 'public'
}

export type NoteSharePermission = 'view' | 'edit'
export type NoteShareStatus = 'pending' | 'accepted'

// ─── Icon & Color Mappings ────────────────────────────────────────────────────

export const NOTE_TYPE_META: Record<NoteType, { label: string, icon: string, color: 'primary' | 'info' | 'warning' | 'success' | 'neutral' }> = {
  [NoteType.Note]: { label: 'Nota', icon: 'i-lucide-file-text', color: 'primary' },
  [NoteType.Idea]: { label: 'Ideia', icon: 'i-lucide-lightbulb', color: 'warning' },
  [NoteType.Concept]: { label: 'Conceito', icon: 'i-lucide-shapes', color: 'info' },
  [NoteType.Research]: { label: 'Pesquisa', icon: 'i-lucide-search', color: 'success' },
  [NoteType.BookNote]: { label: 'Livro', icon: 'i-lucide-book-open', color: 'neutral' }
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface NoteTag {
  id: string
  userId: string
  name: string
  color: string | null
  createdAt: string
}

export interface NoteFolder {
  id: string
  userId: string
  name: string
  parentId: string | null
  position: number
  isExpanded: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateFolderPayload {
  name: string
  parentId?: string | null
}

export interface UpdateFolderPayload {
  name?: string
  parentId?: string | null
  position?: number
  isExpanded?: boolean
}

export interface Note {
  id: string
  userId: string
  title: string
  content: string | null
  type: NoteType
  pinned: boolean
  pinnedAt: string | null
  icon: string | null
  position: number
  createdAt: string
  updatedAt: string
  folderId: string | null
  visibility: NoteVisibility
  shareToken: string | null
  // Populated via joins
  tags?: NoteTag[]
  linkCount?: number
  backlinkCount?: number
}

export interface NoteShare {
  id: string
  noteId: string
  ownerId: string
  sharedWithUserId: string | null
  sharedWithEmail: string
  permission: NoteSharePermission
  status: NoteShareStatus
  createdAt: string
}

export interface CreateNoteSharePayload {
  email: string
  permission: NoteSharePermission
}

export interface UpdateNoteSharePayload {
  permission: NoteSharePermission
}

/** Public, read-only projection served by GET /api/share/[token] — deliberately
 * excludes owner-only fields (userId, tags, backlinks to private notes, etc).
 * `publicWikilinkTargets` maps note id -> share token, for every wikilink/mention
 * target found in `content` that is itself public (so the client can link to
 * `/share/<token>`). Any note id referenced in the content but absent from this
 * map must be rendered as plain (non-clickable) text — exposing it would leak
 * that a private note exists. */
export interface PublicNote {
  title: string
  icon: string | null
  type: NoteType
  content: string | null
  updatedAt: string
  publicWikilinkTargets: Record<string, string>
}

export interface NoteLink {
  id: string
  sourceNoteId: string
  targetNoteId: string
  createdAt: string
  // Populated
  sourceNote?: Pick<Note, 'id' | 'title' | 'type'>
  targetNote?: Pick<Note, 'id' | 'title' | 'type'>
}

export interface NoteTagLink {
  noteId: string
  tagId: string
}

// ─── Graph Types ──────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  title: string
  type: NoteType
  linkCount: number
  x?: number
  y?: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateNotePayload {
  title: string
  content?: string
  type?: NoteType
  icon?: string | null
  tagIds?: string[]
  folderId?: string | null
}

export interface UpdateNotePayload {
  title?: string
  content?: string
  type?: NoteType
  pinned?: boolean
  icon?: string | null
  tagIds?: string[]
  folderId?: string | null
  position?: number
}

export interface CreateTagPayload {
  name: string
  color?: string
}

export interface UpdateTagPayload {
  name?: string
  color?: string
}

export interface LinkNotesPayload {
  targetNoteId: string
}

// ─── Response Types ───────────────────────────────────────────────────────────

export interface NoteListResponse {
  data: Note[]
  total: number
  page: number
  pageSize: number
}

/** 'owner' = full control; 'edit' = shared with edit permission (content only,
 * not folder placement/sharing settings); 'view' = shared read-only. */
export type NoteAccessRole = 'owner' | 'edit' | 'view'

export interface NoteDetail extends Note {
  tags: NoteTag[]
  links: NoteLink[]
  backlinks: NoteLink[]
  accessRole: NoteAccessRole
}

/** A note shared with the current user (not owned by them) — returned by
 * GET /api/notes/shared-with-me. */
export interface SharedNote extends Note {
  permission: NoteSharePermission
}

export interface NoteSearchResult {
  id: string
  title: string
  type: NoteType
  excerpt: string | null
  updatedAt: string
}
