import { protocol } from 'electron'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import * as path from 'node:path'
import { Readable } from 'node:stream'

const ASSET_HOST = 'local'

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
}

interface ByteRange {
  start: number
  end: number
}

export function encodeAssetFilePath(filePath: string): string {
  const normalized = path.normalize(filePath)
  return `tesla-asset://${ASSET_HOST}?path=${encodeURIComponent(normalized)}`
}

export function decodeAssetRequestUrl(requestUrl: string): string {
  const url = new URL(requestUrl)
  const fromQuery = url.searchParams.get('path')
  if (fromQuery) {
    return path.normalize(decodeURIComponent(fromQuery))
  }

  // Backward compatibility with earlier tesla-asset://<encoded-path> URLs.
  const legacy = `${url.hostname}${url.pathname}${url.search}`.replace(/^\//, '')
  if (legacy) {
    return path.normalize(decodeURIComponent(legacy))
  }

  return path.normalize(decodeURIComponent(requestUrl.replace(/^tesla-asset:\/\//i, '')))
}

function getContentType(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function parseRangeHeader(rangeHeader: string | null, fileSize: number): ByteRange | null {
  if (!rangeHeader) {
    return null
  }

  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
  if (!match) {
    return null
  }

  const [, startRaw, endRaw] = match
  if (!startRaw && !endRaw) {
    return null
  }

  if (!startRaw) {
    const suffixLength = Number(endRaw)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return null
    }
    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
    }
  }

  const start = Number(startRaw)
  const end = endRaw ? Number(endRaw) : fileSize - 1
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= fileSize
  ) {
    return null
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  }
}

function fileStreamBody(filePath: string, range?: ByteRange): BodyInit {
  const stream = range
    ? createReadStream(filePath, { start: range.start, end: range.end })
    : createReadStream(filePath)

  return Readable.toWeb(stream) as BodyInit
}

async function createAssetResponse(request: Request, filePath: string): Promise<Response> {
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    return new Response(`Not a file: ${filePath}`, { status: 404 })
  }

  const fileSize = fileStat.size
  const contentType = getContentType(filePath)
  const range = parseRangeHeader(request.headers.get('range'), fileSize)

  if (request.headers.has('range') && !range) {
    return new Response(null, {
      status: 416,
      headers: {
        'Content-Range': `bytes */${fileSize}`,
        'Accept-Ranges': 'bytes',
      },
    })
  }

  if (range) {
    const contentLength = range.end - range.start + 1
    return new Response(request.method === 'HEAD' ? null : fileStreamBody(filePath, range), {
      status: 206,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': String(contentLength),
        'Content-Range': `bytes ${range.start}-${range.end}/${fileSize}`,
        'Content-Type': contentType,
      },
    })
  }

  return new Response(request.method === 'HEAD' ? null : fileStreamBody(filePath), {
    status: 200,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(fileSize),
      'Content-Type': contentType,
    },
  })
}

export function registerAssetProtocol() {
  if (protocol.isProtocolHandled('tesla-asset')) {
    protocol.unhandle('tesla-asset')
  }

  protocol.handle('tesla-asset', async (request) => {
    try {
      const filePath = decodeAssetRequestUrl(request.url)

      if (!existsSync(filePath)) {
        console.error('[tesla-asset] not found:', filePath, 'from', request.url)
        return new Response(`File not found: ${filePath}`, { status: 404 })
      }

      return createAssetResponse(request, filePath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown asset protocol error'
      console.error('[tesla-asset] error:', message, request.url)
      return new Response(message, { status: 500 })
    }
  })
}
