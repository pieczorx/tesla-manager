const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const { version } = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))

for (const relativePath of ['packages/client/package.json', 'packages/desktop/package.json']) {
  const filePath = path.join(rootDir, relativePath)
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  if (pkg.version === version) {
    continue
  }

  pkg.version = version
  fs.writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
  console.log(`Updated ${relativePath} to ${version}`)
}
