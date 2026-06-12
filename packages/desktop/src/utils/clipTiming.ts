import * as path from 'node:path'

export const TESLA_SEGMENT_DURATION_SECONDS = 60

const VIDEO_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-/i

export function parseVideoSegmentStart(filename: string): Date | null {
  const match = path.basename(filename).match(VIDEO_TIMESTAMP_PATTERN)
  if (!match) {
    return null
  }

  const [datePart, timePart] = match[1].split('_')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes, seconds] = timePart.split('-').map(Number)

  if ([year, month, day, hours, minutes, seconds].some((value) => Number.isNaN(value))) {
    return null
  }

  return new Date(year, month - 1, day, hours, minutes, seconds)
}

export function parseEventTimestamp(timestamp: string): Date | null {
  const normalized = timestamp.trim().replace(' ', 'T')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed
}

export function resolveLastSegmentDurationSeconds(
  lastSegmentStart: Date,
  eventTimestamp: string,
  segmentDurations?: Record<string, number>,
): number {
  const lastTimestampKey = formatSegmentTimestampKey(lastSegmentStart)
  const probedDuration = segmentDurations?.[lastTimestampKey]
  if (probedDuration !== undefined && probedDuration > 0) {
    return probedDuration
  }

  const eventDate = parseEventTimestamp(eventTimestamp)
  if (eventDate && eventDate.getTime() > lastSegmentStart.getTime()) {
    const eventBasedDuration = (eventDate.getTime() - lastSegmentStart.getTime()) / 1000
    if (eventBasedDuration > 0) {
      return Math.min(TESLA_SEGMENT_DURATION_SECONDS, eventBasedDuration)
    }
  }

  return TESLA_SEGMENT_DURATION_SECONDS
}

function formatSegmentTimestampKey(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

export function resolveSegmentDurationSeconds(options: {
  timestampKey: string
  startMs: number
  isLastSegment: boolean
  segmentDurations?: Record<string, number>
  clipDurationSeconds?: number
}): number {
  const { timestampKey, startMs, isLastSegment, segmentDurations, clipDurationSeconds } = options

  const probedDuration = segmentDurations?.[timestampKey]
  if (probedDuration !== undefined && probedDuration > 0) {
    return probedDuration
  }

  if (isLastSegment && clipDurationSeconds !== undefined && clipDurationSeconds > 0) {
    const inferred = clipDurationSeconds - startMs / 1000
    if (inferred > 0 && inferred <= TESLA_SEGMENT_DURATION_SECONDS) {
      return inferred
    }
  }

  return TESLA_SEGMENT_DURATION_SECONDS
}

export function computeClipTiming(
  eventTimestamp: string,
  videoFiles: string[],
  segmentDurations?: Record<string, number>,
) {
  const segmentStarts = [...new Set(
    videoFiles
      .map((file) => parseVideoSegmentStart(file))
      .filter((value): value is Date => value !== null)
      .map((date) => date.getTime()),
  )]
    .sort((a, b) => a - b)
    .map((value) => new Date(value))

  if (segmentStarts.length === 0) {
    return {
      durationSeconds: 0,
      eventOffsetSeconds: null,
      clipStartIso: null,
      clipEndIso: null,
    }
  }

  const clipStart = segmentStarts[0]
  const lastSegmentStart = segmentStarts[segmentStarts.length - 1]
  const lastSegmentDuration = resolveLastSegmentDurationSeconds(
    lastSegmentStart,
    eventTimestamp,
    segmentDurations,
  )
  const clipEnd = new Date(lastSegmentStart.getTime() + lastSegmentDuration * 1000)
  const durationSeconds = Math.max(
    TESLA_SEGMENT_DURATION_SECONDS,
    (clipEnd.getTime() - clipStart.getTime()) / 1000,
  )

  const eventDate = parseEventTimestamp(eventTimestamp)
  let eventOffsetSeconds: number | null = null
  if (eventDate) {
    const offset = (eventDate.getTime() - clipStart.getTime()) / 1000
    eventOffsetSeconds = Math.max(0, Math.min(durationSeconds, offset))
  }

  return {
    durationSeconds,
    eventOffsetSeconds,
    clipStartIso: clipStart.toISOString(),
    clipEndIso: clipEnd.toISOString(),
  }
}
