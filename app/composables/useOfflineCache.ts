import { get, set } from 'idb-keyval'
import type { Note, NoteFolder } from '~/types/notes'

const NOTES_KEY = 'kortex-notes-cache-notes'
const FOLDERS_KEY = 'kortex-notes-cache-folders'

/**
 * Thin write-through cache of the user's notes/folders in IndexedDB, so the
 * app can still render the last-known tree when the initial load happens
 * offline (a plain reload with no network would otherwise show an empty
 * state). Not a general-purpose store — just enough to hydrate the sidebar
 * before the mutation queue (useMutationQueue) and sync engine take over.
 */
export function useOfflineCache() {
  async function loadCachedNotes(): Promise<Note[]> {
    return (await get<Note[]>(NOTES_KEY)) ?? []
  }

  async function saveCachedNotes(notes: Note[]): Promise<void> {
    await set(NOTES_KEY, notes)
  }

  async function loadCachedFolders(): Promise<NoteFolder[]> {
    return (await get<NoteFolder[]>(FOLDERS_KEY)) ?? []
  }

  async function saveCachedFolders(folders: NoteFolder[]): Promise<void> {
    await set(FOLDERS_KEY, folders)
  }

  return { loadCachedNotes, saveCachedNotes, loadCachedFolders, saveCachedFolders }
}
