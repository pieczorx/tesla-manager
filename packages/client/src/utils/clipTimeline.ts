export function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function getEventMarkerPercent(
  durationSeconds: number,
  eventOffsetSeconds: number | null,
): number | null {
  if (durationSeconds <= 0 || eventOffsetSeconds === null) {
    return null
  }

  return Math.max(0, Math.min(100, (eventOffsetSeconds / durationSeconds) * 100))
}

export function getMarkerPercent(
  durationSeconds: number,
  offsetSeconds: number | null,
): number | null {
  if (durationSeconds <= 0 || offsetSeconds === null) {
    return null
  }

  return Math.max(0, Math.min(100, (offsetSeconds / durationSeconds) * 100))
}

export function getEffectiveMarkerRange(
  durationSeconds: number,
  inOffsetSeconds: number | null,
  outOffsetSeconds: number | null,
): { inPercent: number; outPercent: number } | null {
  if (durationSeconds <= 0 || (inOffsetSeconds === null && outOffsetSeconds === null)) {
    return null
  }

  return {
    inPercent: Math.max(0, Math.min(100, ((inOffsetSeconds ?? 0) / durationSeconds) * 100)),
    outPercent: Math.max(0, Math.min(100, ((outOffsetSeconds ?? durationSeconds) / durationSeconds) * 100)),
  }
}

export function getClipDisplayTitle(clip: { customTitle: string | null; timestamp: string }): string {
  const custom = clip.customTitle?.trim()
  if (custom) {
    return custom
  }
  return formatClipTimestamp(clip.timestamp)
}

export function formatClipTimestamp(timestamp: string): string {
  const date = new Date(timestamp.trim().replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) {
    return timestamp
  }

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}
