import type { DashcamClip } from '@/types/electron'
import { getEventTypeFilterKey, type EventTypeFilter } from '@/utils/clipEventReason'
import { formatClipTimestamp } from '@/utils/clipTimeline'

export type DateRangePreset = 'all' | 'today' | 'last7' | 'last30' | 'custom'

export type ClipLibraryFilter = 'all' | 'favourites' | 'archive'

export type ClipListViewMode = 'minimal' | 'default' | 'thumbnails'

export const CLIP_LIST_VIEW_OPTIONS: Array<{
  value: ClipListViewMode
  label: string
  icon: ['fas' | 'far', string]
}> = [
  { value: 'minimal', label: 'Minimal', icon: ['fas', 'grip-lines'] },
  { value: 'default', label: 'Default', icon: ['fas', 'list'] },
  { value: 'thumbnails', label: 'Thumbnails', icon: ['fas', 'table-cells-large'] },
]

export const CLIP_LIBRARY_FILTER_OPTIONS: Array<{
  value: ClipLibraryFilter
  label: string
  icon: ['fas' | 'far', string]
}> = [
  { value: 'all', label: 'All', icon: ['fas', 'layer-group'] },
  { value: 'favourites', label: 'Favourites', icon: ['fas', 'star'] },
  { value: 'archive', label: 'Archive', icon: ['fas', 'box-archive'] },
]

export const DATE_RANGE_PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
]

export interface ClipFilterState {
  eventType: EventTypeFilter
  datePreset: DateRangePreset
  dateFrom: string
  dateTo: string
}

export function createDefaultClipFilters(): ClipFilterState {
  return {
    eventType: 'all',
    datePreset: 'all',
    dateFrom: '',
    dateTo: '',
  }
}

export function parseClipDate(timestamp: string): Date | null {
  const date = new Date(timestamp.trim().replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function getDateRangeBounds(filters: ClipFilterState): { from: Date | null; to: Date | null } {
  const now = new Date()

  switch (filters.datePreset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) }
    case 'last7': {
      const from = new Date(now)
      from.setDate(from.getDate() - 6)
      return { from: startOfDay(from), to: endOfDay(now) }
    }
    case 'last30': {
      const from = new Date(now)
      from.setDate(from.getDate() - 29)
      return { from: startOfDay(from), to: endOfDay(now) }
    }
    case 'custom': {
      const from = filters.dateFrom ? startOfDay(new Date(`${filters.dateFrom}T00:00:00`)) : null
      const to = filters.dateTo ? endOfDay(new Date(`${filters.dateTo}T00:00:00`)) : null
      return { from, to }
    }
    default:
      return { from: null, to: null }
  }
}

export function filterClipsByLibrary(clips: DashcamClip[], libraryFilter: ClipLibraryFilter): DashcamClip[] {
  switch (libraryFilter) {
    case 'favourites':
      return clips.filter((clip) => clip.isFavorite && !clip.isArchived)
    case 'archive':
      return clips.filter((clip) => clip.isArchived)
    default:
      return clips.filter((clip) => !clip.isArchived)
  }
}

export function filterClips(
  clips: DashcamClip[],
  filters: ClipFilterState,
  libraryFilter: ClipLibraryFilter = 'all',
  searchQuery = '',
): DashcamClip[] {
  const libraryFiltered = filterClipsByLibrary(clips, libraryFilter)
  const { from, to } = getDateRangeBounds(filters)

  return libraryFiltered.filter((clip) => {
    if (filters.eventType !== 'all' && getEventTypeFilterKey(clip.reason) !== filters.eventType) {
      return false
    }

    if (from || to) {
      const clipDate = parseClipDate(clip.timestamp)
      if (!clipDate) {
        return false
      }

      if (from && clipDate < from) {
        return false
      }
      if (to && clipDate > to) {
        return false
      }
    }

    return matchesClipSearch(clip, searchQuery)
  })
}

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function getDatePresetLabel(filters: ClipFilterState): string {
  if (filters.datePreset === 'custom') {
    if (filters.dateFrom && filters.dateTo) {
      return `${formatShortDate(filters.dateFrom)} – ${formatShortDate(filters.dateTo)}`
    }
    if (filters.dateFrom) {
      return `From ${formatShortDate(filters.dateFrom)}`
    }
    if (filters.dateTo) {
      return `Until ${formatShortDate(filters.dateTo)}`
    }
    return 'Custom range'
  }

  return DATE_RANGE_PRESET_OPTIONS.find((option) => option.value === filters.datePreset)?.label ?? 'All time'
}

export function matchesClipSearch(clip: DashcamClip, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  const parts: string[] = []

  if (clip.city) {
    parts.push(clip.city)
  } else if (clip.latitude !== null && clip.longitude !== null) {
    parts.push(`${clip.latitude.toFixed(4)}, ${clip.longitude.toFixed(4)}`)
  }

  if (clip.customTitle?.trim()) {
    parts.push(clip.customTitle.trim())
  }

  if (clip.timestamp) {
    parts.push(clip.timestamp)
    parts.push(formatClipTimestamp(clip.timestamp))
  }

  return parts.join(' ').toLowerCase().includes(normalized)
}

export function countClipsByEventType(clips: DashcamClip[]): Record<Exclude<EventTypeFilter, 'all'>, number> {
  const counts = {
    sentry: 0,
    manual: 0,
    vehicle: 0,
    other: 0,
  }

  for (const clip of clips) {
    counts[getEventTypeFilterKey(clip.reason)] += 1
  }

  return counts
}
