const { downloadArtifact } = require('@electron/get')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const electronDir = path.resolve(__dirname, '..', 'node_modules', 'electron')
  const distDir = path.join(electronDir, 'dist')
  const version = require(path.join(electronDir, 'package.json')).version

  if (fs.existsSync(path.join(distDir, process.platform === 'win32' ? 'electron.exe' : 'Electron.app'))) {
    console.log('Electron already installed')
    return
  }

  const zip = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
  })

  fs.rmSync(distDir, { recursive: true, force: true })
  fs.mkdirSync(distDir, { recursive: true })

  const extract = spawnSync('tar', ['-xf', zip, '-C', distDir], { stdio: 'inherit' })
  if (extract.status !== 0) {
    throw new Error(`Failed to extract Electron archive (${extract.status ?? 'unknown'})`)
  }

  fs.writeFileSync(path.join(electronDir, 'path.txt'), `${process.platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron'}\n`, 'utf8')
  fs.writeFileSync(path.join(distDir, 'version'), `v${version}`)
  console.log(`Electron ${version} installed`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
