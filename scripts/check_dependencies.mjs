import { readFile, stat } from 'node:fs/promises'

const manifest = JSON.parse(await readFile('package.json', 'utf8'))
const dependencyLock = JSON.parse(await readFile('dependencies.lock.json', 'utf8'))
const designSystem = dependencyLock.design_system

if (dependencyLock.schema_version !== 1) {
  throw new Error('unsupported dependencies.lock.json schema')
}

for (const [name, dependency] of Object.entries({
  design_system: designSystem,
  truco_server: dependencyLock.truco_server,
})) {
  if (!dependency || !/^[0-9a-f]{40}$/.test(dependency.revision)) {
    throw new Error(`${name} must use a full immutable Git revision`)
  }
  if (!dependency.repository.startsWith('https://github.com/baixada-cards/')) {
    throw new Error(`${name} must resolve from the public Baixada organization`)
  }
}

const expectedDesignSpecifier =
  `git+${designSystem.repository}#${designSystem.revision}`
if (manifest.dependencies[designSystem.package] !== expectedDesignSpecifier) {
  throw new Error('package.json design-system dependency does not match dependencies.lock.json')
}

for (const obsoleteMirror of [
  'src/baixada-tokens.css',
  'src/components/brand/BaixadaBrand.css',
  'src/components/brand/BaixadaBrand.tsx',
  'src/components/brand/TrucoIcon.tsx',
]) {
  try {
    await stat(obsoleteMirror)
    throw new Error(`shared design mirror must remain removed: ${obsoleteMirror}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

console.log(
  `validated design-system ${designSystem.revision.slice(0, 8)} and server ${dependencyLock.truco_server.revision.slice(0, 8)}`,
)
