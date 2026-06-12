import { resolveSegmentDurationSeconds } from './clipTimingShared'

export interface BuildCameraTracksOptions {
  segmentDurations?: Record<string, number>
  clipDurationSeconds?: number
}

export interface VideoSegment {
  filePath: string
  startMs: number
  durationSeconds: number
}

export interface CameraTrack {
  id: string
  label: string
  segments: VideoSegment[]
  gridRow: number
  gridCol: number
  order: number
}

const CAMERA_META: Record<string, { label: string; gridRow: number; gridCol: number; order: number }> = {
  left_pillar: { label: 'Left Pillar', gridRow: 1, gridCol: 1, order: 0 },
  front: { label: 'Front', gridRow: 1, gridCol: 2, order: 1 },
  right_pillar: { label: 'Right Pillar', gridRow: 1, gridCol: 3, order: 2 },
  left_repeater: { label: 'Left Repeater', gridRow: 2, gridCol: 1, order: 3 },
  back: { label: 'Rear', gridRow: 2, gridCol: 2, order: 4 },
  right_repeater: { label: 'Right Repeater', gridRow: 2, gridCol: 3, order: 5 },
}

const VIDEO_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})-(.+)\.mp4$/i

function parseSegmentStartMs(timestampKey: string): number | null {
  const [datePart, timePart] = timestampKey.split('_')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes, seconds] = timePart.split('-').map(Number)

  if ([year, month, day, hours, minutes, seconds].some((value) => Number.isNaN(value))) {
    return null
  }

  return new Date(year, month - 1, day, hours, minutes, seconds).getTime()
}

function formatCameraLabel(cameraId: string): string {
  return cameraId
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

interface ParsedSegment {
  filePath: string
  startMs: number
  timestampKey: string
}

export function buildCameraTracks(
  videoFiles: string[],
  clipStartIso: string | null,
  options: BuildCameraTracksOptions = {},
): CameraTrack[] {
  const clipStartMs = clipStartIso ? new Date(clipStartIso).getTime() : null
  const byCamera = new Map<string, ParsedSegment[]>()

  for (const filePath of videoFiles) {
    const basename = filePath.split(/[\\/]/).pop() ?? filePath
    const match = basename.match(VIDEO_FILE_PATTERN)
    if (!match) {
      continue
    }

    const segmentStartMs = parseSegmentStartMs(match[1])
    if (segmentStartMs === null) {
      continue
    }

    const cameraId = match[2].toLowerCase()
    const startMs = clipStartMs !== null ? Math.max(0, segmentStartMs - clipStartMs) : segmentStartMs

    const segments = byCamera.get(cameraId) ?? []
    const existing = segments.find((segment) => segment.startMs === startMs)
    if (existing) {
      existing.filePath = filePath
    } else {
      segments.push({
        filePath,
        startMs,
        timestampKey: match[1],
      })
    }
    byCamera.set(cameraId, segments)
  }

  const tracks: CameraTrack[] = []
  let fallbackOrder = 10

  for (const [cameraId, segments] of byCamera.entries()) {
    segments.sort((a, b) => a.startMs - b.startMs)
    const videoSegments: VideoSegment[] = segments.map((segment, index) => ({
      filePath: segment.filePath,
      startMs: segment.startMs,
      durationSeconds: resolveSegmentDurationSeconds({
        timestampKey: segment.timestampKey,
        startMs: segment.startMs,
        isLastSegment: index === segments.length - 1,
        segmentDurations: options.segmentDurations,
        clipDurationSeconds: options.clipDurationSeconds,
      }),
    }))
    const meta = CAMERA_META[cameraId]

    tracks.push({
      id: cameraId,
      label: meta?.label ?? formatCameraLabel(cameraId),
      segments: videoSegments,
      gridRow: meta?.gridRow ?? 3,
      gridCol: meta?.gridCol ?? 1,
      order: meta?.order ?? fallbackOrder++,
    })
  }

  return tracks.sort((a, b) => a.order - b.order)
}

export function resolvePlaybackPosition(
  track: CameraTrack,
  globalSeconds: number,
): { segment: VideoSegment; localSeconds: number } | null {
  if (track.segments.length === 0) {
    return null
  }

  const globalMs = globalSeconds * 1000

  for (const segment of track.segments) {
    const endMs = segment.startMs + segment.durationSeconds * 1000
    if (globalMs >= segment.startMs && globalMs < endMs) {
      return {
        segment,
        localSeconds: (globalMs - segment.startMs) / 1000,
      }
    }
  }

  // Before the first segment, in a gap, or past the last segment:
  // pick the nearest segment but keep localSeconds unclamped so the video
  // component can hold a frame instead of restarting playback.
  let current = track.segments[0]
  for (const segment of track.segments) {
    if (segment.startMs <= globalMs) {
      current = segment
    } else {
      break
    }
  }

  return {
    segment: current,
    localSeconds: (globalMs - current.startMs) / 1000,
  }
}

export function getDefaultCameraId(tracks: CameraTrack[]): string | null {
  return tracks.find((track) => track.id === 'front')?.id ?? tracks[0]?.id ?? null
}
