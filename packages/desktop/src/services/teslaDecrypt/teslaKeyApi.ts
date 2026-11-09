import type { EncryptedHeader } from './container'

export const TESLA_DASHCAM_ORIGIN = 'https://dashcam.tesla.com'
const DECRYPT_BATCH_URL = `${TESLA_DASHCAM_ORIGIN}/api/1/decrypt/batch`
const REQUEST_TIMEOUT_MS = 30_000
const MAX_ATTEMPTS = 4
const BASE_BACKOFF_MS = 1_000

export class TeslaUnauthorizedError extends Error {
  constructor() {
    super('Tesla session expired or is invalid')
  }
}

export interface FileKeyResult {
  key: Buffer | null
  error: string | null
}

interface BatchResponse {
  results?: Array<{ id?: string; key?: string | null; error?: string | null }>
}

/**
 * The timestamp is a uint64 in the header. JSON.stringify cannot write a BigInt, and
 * Number would lose precision above 2^53, so it is spliced into the JSON as a raw literal.
 */
export interface KeyRequestItem {
  header: EncryptedHeader
  /** Send the key bytes exactly as stored instead of the normalized 65-byte point. */
  useRawPublicKey?: boolean
}

function serializeRequest(requests: KeyRequestItem[]): string {
  const items = requests.map(({ header, useRawPublicKey }) => {
    const item: Record<string, unknown> = {
      id: header.id,
      vin: header.vin,
      key_id: header.keyId,
      wrapped_key: header.wrappedKey.toString('base64'),
      public_key: (useRawPublicKey ? header.publicKeyRaw : header.publicKey).toString('base64'),
    }
    if (header.timestamp !== 0n) {
      item.timestamp = `__ts_${header.timestamp.toString()}__`
    }
    return item
  })
  return JSON.stringify({ items }).replace(/"__ts_(\d+)__"/g, '$1')
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason ?? new Error('Aborted'))
      },
      { once: true },
    )
  })
}

/**
 * Asks Tesla for the AES key of each file - the same request dashcam.tesla.com makes.
 * Only header metadata is sent; video data never leaves the computer.
 * Callers must not put two headers with the same `id` in one request.
 */
export async function requestFileKeys(
  token: string,
  items: KeyRequestItem[],
  signal?: AbortSignal,
): Promise<Map<string, FileKeyResult>> {
  const body = serializeRequest(items)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 2), signal)
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

    let response: Response
    try {
      response = await fetch(DECRYPT_BATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Origin: TESLA_DASHCAM_ORIGIN,
          Referer: `${TESLA_DASHCAM_ORIGIN}/`,
        },
        body,
        signal: requestSignal,
      })
    } catch (error) {
      if (signal?.aborted) {
        throw error
      }
      lastError = new Error('Could not reach Tesla - check your internet connection')
      continue
    }

    if (response.status === 401 || response.status === 403) {
      throw new TeslaUnauthorizedError()
    }
    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(`Tesla is temporarily unavailable (HTTP ${response.status})`)
      continue
    }
    if (!response.ok) {
      const snippet = (await response.text().catch(() => '')).slice(0, 300)
      throw new Error(`Tesla rejected the key request (HTTP ${response.status})${snippet ? `: ${snippet}` : ''}`)
    }

    const data = (await response.json()) as BatchResponse
    const results = new Map<string, FileKeyResult>()
    for (const result of data.results ?? []) {
      if (!result.id) {
        continue
      }
      if (result.error) {
        results.set(result.id, { key: null, error: String(result.error) })
        continue
      }
      if (!result.key) {
        results.set(result.id, { key: null, error: 'Tesla returned no key for this file' })
        continue
      }
      results.set(result.id, { key: Buffer.from(result.key, 'base64'), error: null })
    }
    return results
  }

  throw lastError instanceof Error ? lastError : new Error('Key request failed')
}
