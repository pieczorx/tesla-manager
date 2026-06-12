import type { DashcamClip, PlaybackSettings } from '@/types/electron'

export const TESLA_SEGMENT_DURATION_SECONDS = 60

export function formatSegmentTimestampKey(date: Date): string {
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

export const DEFAULT_PLAYBACK_SETTINGS: PlaybackSettings = {
  inLeadSeconds: 10,
  outTrailSeconds: 10,
}

export function formatPlaybackTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

export function getDefaultMarkerOffsets(
  eventOffsetSeconds: number | null,
  durationSeconds: number,
  settings: PlaybackSettings = DEFAULT_PLAYBACK_SETTINGS,
): { inOffsetSeconds: number; outOffsetSeconds: number } | null {
  if (eventOffsetSeconds === null || durationSeconds <= 0) {
    return null
  }

  return {
    inOffsetSeconds: Math.max(0, eventOffsetSeconds - settings.inLeadSeconds),
    outOffsetSeconds: Math.min(durationSeconds, eventOffsetSeconds + settings.outTrailSeconds),
  }
}

export interface ResolvedClipMarkers {
  inOffsetSeconds: number
  outOffsetSeconds: number
  hasCustomMarkers: boolean
  hasDefaultRange: boolean
}

export function resolveClipMarkers(
  clip: Pick<DashcamClip, 'inOffsetSeconds' | 'outOffsetSeconds' | 'eventOffsetSeconds' | 'durationSeconds'>,
  settings: PlaybackSettings = DEFAULT_PLAYBACK_SETTINGS,
): ResolvedClipMarkers {
  const defaults = getDefaultMarkerOffsets(clip.eventOffsetSeconds, clip.durationSeconds, settings)
  const hasCustomMarkers = clip.inOffsetSeconds !== null || clip.outOffsetSeconds !== null

  if (defaults) {
    return {
      inOffsetSeconds: clip.inOffsetSeconds ?? defaults.inOffsetSeconds,
      outOffsetSeconds: clip.outOffsetSeconds ?? defaults.outOffsetSeconds,
      hasCustomMarkers,
      hasDefaultRange: true,
    }
  }

  return {
    inOffsetSeconds: clip.inOffsetSeconds ?? 0,
    outOffsetSeconds: clip.outOffsetSeconds ?? clip.durationSeconds,
    hasCustomMarkers,
    hasDefaultRange: false,
  }
}

export function clipHasMarkerRange(
  clip: Pick<DashcamClip, 'inOffsetSeconds' | 'outOffsetSeconds' | 'eventOffsetSeconds' | 'durationSeconds'>,
): boolean {
  return (
    clip.inOffsetSeconds !== null
    || clip.outOffsetSeconds !== null
    || clip.eventOffsetSeconds !== null
  )
}

export function getInitialPlaybackSeconds(
  eventOffsetSeconds: number | null,
  leadSeconds = DEFAULT_PLAYBACK_SETTINGS.inLeadSeconds,
): number {
  if (eventOffsetSeconds === null) {
    return 0
  }

  return Math.max(0, eventOffsetSeconds - leadSeconds)
}
