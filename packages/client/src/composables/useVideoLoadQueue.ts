const MAX_CONCURRENT_LOADS = 6

let activeLoads = 0
const waitQueue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (activeLoads < MAX_CONCURRENT_LOADS) {
    activeLoads += 1
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    waitQueue.push(() => {
      activeLoads += 1
      resolve()
    })
  })
}

function releaseSlot() {
  activeLoads = Math.max(0, activeLoads - 1)
  const next = waitQueue.shift()
  if (next) {
    next()
  }
}

export async function withVideoLoadSlot<T>(task: () => Promise<T>): Promise<T> {
  await acquireSlot()
  try {
    return await task()
  } finally {
    releaseSlot()
  }
}

export function resetVideoLoadQueue() {
  activeLoads = 0
  waitQueue.length = 0
}
