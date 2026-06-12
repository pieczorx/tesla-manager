import type { DashcamClip } from '@/types/electron'
import { parseClipDate } from '@/utils/clipFilters'

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function getWeekMonday(date: Date): Date {
  const dayStart = startOfDay(date)
  const weekday = dayStart.getDay()
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1
  return addDays(dayStart, -daysFromMonday)
}

function formatDayMonth(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${day}.${month}`
}

function formatWeekdayWithDate(date: Date): string {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(date)
  return `${weekday} ${formatDayMonth(date)}`
}

function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)
}

function dateKey(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function monthKey(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  return `${date.getFullYear()}-${month}`
}

type DayBucketKind = 'today' | 'yesterday' | 'this-week' | 'last-week' | 'month'

interface DayBucketInfo {
  kind: DayBucketKind
  dayKey: string
  dayLabel: string
  monthKey?: string
  monthLabel?: string
}

function classifyClipDay(clipDay: Date, now: Date): DayBucketInfo {
  const today = startOfDay(now)
  const yesterday = addDays(today, -1)
  const thisWeekMonday = getWeekMonday(now)
  const lastWeekMonday = addDays(thisWeekMonday, -7)

  if (clipDay.getTime() === today.getTime()) {
    return { kind: 'today', dayKey: 'today', dayLabel: 'Today' }
  }

  if (clipDay.getTime() === yesterday.getTime()) {
    return { kind: 'yesterday', dayKey: 'yesterday', dayLabel: 'Yesterday' }
  }

  if (clipDay.getTime() >= thisWeekMonday.getTime()) {
    return { kind: 'this-week', dayKey: dateKey(clipDay), dayLabel: formatWeekdayWithDate(clipDay) }
  }

  if (clipDay.getTime() >= lastWeekMonday.getTime()) {
    return { kind: 'last-week', dayKey: dateKey(clipDay), dayLabel: formatWeekdayWithDate(clipDay) }
  }

  const mk = monthKey(clipDay)
  const label = formatMonthYear(clipDay)
  return { kind: 'month', dayKey: mk, dayLabel: label, monthKey: mk, monthLabel: label }
}

export interface ClipDayGroup {
  key: string
  label: string
  clips: DashcamClip[]
}

export type ClipListBlock =
  | {
      type: 'week'
      key: string
      sectionLabel: string | null
      groups: ClipDayGroup[]
    }
  | {
      type: 'month'
      key: string
      label: string
      clips: DashcamClip[]
    }

function pushToDayGroups(groups: ClipDayGroup[], key: string, label: string, clip: DashcamClip) {
  const existing = groups.find((group) => group.key === key)
  if (existing) {
    existing.clips.push(clip)
    return
  }

  groups.push({ key, label, clips: [clip] })
}

export function groupClipsForList(clips: DashcamClip[], now = new Date()): ClipListBlock[] {
  const sorted = [...clips].sort((a, b) => b.timestamp.localeCompare(a.timestamp))

  const thisWeekGroups: ClipDayGroup[] = []
  const lastWeekGroups: ClipDayGroup[] = []
  const monthBlocks = new Map<string, { key: string; label: string; clips: DashcamClip[] }>()
  const undatedClips: DashcamClip[] = []

  for (const clip of sorted) {
    const clipDate = parseClipDate(clip.timestamp)
    if (!clipDate) {
      undatedClips.push(clip)
      continue
    }

    const clipDay = startOfDay(clipDate)
    const info = classifyClipDay(clipDay, now)

    if (info.kind === 'month') {
      const mk = info.monthKey!
      const existing = monthBlocks.get(mk)
      if (existing) {
        existing.clips.push(clip)
      } else {
        monthBlocks.set(mk, { key: mk, label: info.monthLabel!, clips: [clip] })
      }
      continue
    }

    if (info.kind === 'last-week') {
      pushToDayGroups(lastWeekGroups, info.dayKey, info.dayLabel, clip)
      continue
    }

    pushToDayGroups(thisWeekGroups, info.dayKey, info.dayLabel, clip)
  }

  const blocks: ClipListBlock[] = []

  if (thisWeekGroups.length > 0) {
    blocks.push({ type: 'week', key: 'this-week', sectionLabel: null, groups: thisWeekGroups })
  }

  if (lastWeekGroups.length > 0) {
    blocks.push({ type: 'week', key: 'last-week', sectionLabel: 'Last week', groups: lastWeekGroups })
  }

  const sortedMonths = Array.from(monthBlocks.values()).sort((a, b) => b.key.localeCompare(a.key))
  for (const month of sortedMonths) {
    blocks.push({ type: 'month', key: month.key, label: month.label, clips: month.clips })
  }

  if (undatedClips.length > 0) {
    blocks.push({ type: 'month', key: 'undated', label: 'Unknown date', clips: undatedClips })
  }

  return blocks
}
