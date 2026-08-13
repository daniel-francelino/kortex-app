const NOTE_TAG_COLOR_MAP: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500'
}

export function getNoteTagColorClass(color: string | null | undefined): string {
  if (!color) return 'bg-primary'
  return NOTE_TAG_COLOR_MAP[color] ?? 'bg-primary'
}
