const { downloadArtifact } = require('@electron/get')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function getElectronBinaryPath(distDir) {
  return path.join(
    distDir,
    process.platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron',
  )
}

async function main() {
  const electronDir = path.resolve(__dirname, '..', 'node_modules', 'electron')
  const distDir = path.join(electronDir, 'dist')
  const electronBinary = getElectronBinaryPath(distDir)
  const version = require(path.join(electronDir, 'package.json')).version

  if (fs.existsSync(electronBinary)) {
    console.log('Electron already installed')
    return
  }

  // In CI and during parallel yarn installs, the electron package handles its own download.
  if (process.env.CI || fs.existsSync(distDir)) {
    console.log('Electron install handled by electron package, skipping custom install')
    return
  }

  const zip = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform,
    arch: process.arch,
  })

  fs.mkdirSync(distDir, { recursive: true })

  const extract = spawnSync('tar', ['-xf', zip, '-C', distDir], { stdio: 'inherit' })
  if (extract.status !== 0) {
    throw new Error(`Failed to extract Electron archive (${extract.status ?? 'unknown'})`)
  }

  fs.writeFileSync(
    path.join(electronDir, 'path.txt'),
    `${process.platform === 'win32' ? 'electron.exe' : 'Electron.app/Contents/MacOS/Electron'}\n`,
    'utf8',
  )
  fs.writeFileSync(path.join(distDir, 'version'), `v${version}\n`, 'utf8')
  console.log(`Electron ${version} installed`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
