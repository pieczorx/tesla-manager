const { execSync } = require('node:child_process')
const fs = require('node:fs')

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version
let shouldRelease = true

try {
  const prevVersion = JSON.parse(
    execSync('git show HEAD~1:package.json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }),
  ).version

  if (prevVersion === version) {
    console.log(`Version unchanged (${version}), skipping release.`)
    shouldRelease = false
  }
} catch {
  // First commit or no parent — proceed with release.
}

if (shouldRelease) {
  try {
    execSync(`git rev-parse refs/tags/v${version}`, { stdio: 'ignore' })
    console.log(`Tag v${version} already exists, skipping release.`)
    shouldRelease = false
  } catch {
    // Tag does not exist — proceed with release.
  }
}

const output = process.env.GITHUB_OUTPUT
if (output) {
  fs.appendFileSync(output, `version=${version}\nchanged=${shouldRelease}\n`)
} else {
  console.log(`version=${version}`)
  console.log(`changed=${shouldRelease}`)
}
