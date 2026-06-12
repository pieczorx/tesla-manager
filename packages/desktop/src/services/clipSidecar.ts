import { readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import type { DashcamClip } from '../shared/types'

export const CLIP_SIDECAR_FILENAME = 'teslamanager.json'
export const CLIP_SIDECAR_VERSION = 1 as const

export interface ClipSidecarV1 {
  version: typeof CLIP_SIDECAR_VERSION
  updatedAt: string
  isFavorite: boolean
  isArchived: boolean
  inOffsetSeconds: number | null
  outOffsetSeconds: number | null
  customTitle: string | null
  segmentDurations?: Record<string, number>
}

function sidecarPath(folderPath: string): string {
  return path.join(folderPath, CLIP_SIDECAR_FILENAME)
}

function normalizeSidecarValue(value: unknown): boolean {
  return value === true
}

function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeSegmentDurations(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const durations: Record<string, number> = {}
  for (const [key, rawDuration] of Object.entries(value as Record<string, unknown>)) {
    const parsed = Number(rawDuration)
    if (Number.isFinite(parsed) && parsed > 0) {
      durations[key] = parsed
    }
  }

  return Object.keys(durations).length > 0 ? durations : undefined
}

function parseSidecar(data: unknown): ClipSidecarV1 | null {
  if (!data || typeof data !== 'object') {
    return null
  }

  const record = data as Record<string, unknown>
  if (record.version !== CLIP_SIDECAR_VERSION) {
    return null
  }

  return {
    version: CLIP_SIDECAR_VERSION,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
    isFavorite: normalizeSidecarValue(record.isFavorite),
    isArchived: normalizeSidecarValue(record.isArchived),
    inOffsetSeconds: normalizeNullableNumber(record.inOffsetSeconds),
    outOffsetSeconds: normalizeNullableNumber(record.outOffsetSeconds),
    customTitle: normalizeNullableString(record.customTitle),
    segmentDurations: normalizeSegmentDurations(record.segmentDurations),
  }
}

export function clipToSidecar(clip: DashcamClip): ClipSidecarV1 {
  return {
    version: CLIP_SIDECAR_VERSION,
    updatedAt: new Date().toISOString(),
    isFavorite: clip.isFavorite,
    isArchived: clip.isArchived,
    inOffsetSeconds: clip.inOffsetSeconds,
    outOffsetSeconds: clip.outOffsetSeconds,
    customTitle: clip.customTitle,
    segmentDurations:
      clip.segmentDurations && Object.keys(clip.segmentDurations).length > 0
        ? clip.segmentDurations
        : undefined,
  }
}

export function applySidecarToClip(clip: DashcamClip, sidecar: ClipSidecarV1): DashcamClip {
  return {
    ...clip,
    isFavorite: sidecar.isFavorite,
    isArchived: sidecar.isArchived,
    inOffsetSeconds: sidecar.inOffsetSeconds,
    outOffsetSeconds: sidecar.outOffsetSeconds,
    customTitle: sidecar.customTitle,
    segmentDurations: sidecar.segmentDurations ?? clip.segmentDurations,
  }
}

export async function readClipSidecar(folderPath: string): Promise<ClipSidecarV1 | null> {
  try {
    const raw = await readFile(sidecarPath(folderPath), 'utf8')
    return parseSidecar(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

export async function writeClipSidecar(clip: DashcamClip): Promise<void> {
  try {
    const payload = clipToSidecar(clip)
    await writeFile(sidecarPath(clip.folderPath), `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  } catch (error) {
    console.warn(`Failed to write ${CLIP_SIDECAR_FILENAME} for ${clip.folderPath}:`, error)
  }
}

export async function writeClipSidecars(clips: DashcamClip[]): Promise<void> {
  await Promise.all(clips.map((clip) => writeClipSidecar(clip)))
}
