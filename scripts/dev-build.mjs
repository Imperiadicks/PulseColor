import path from 'node:path'
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getPulseSyncAddonDir } from './pulsesync-paths.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js')
const outDir = path.resolve(getPulseSyncAddonDir())
const inPlaceBuild = outDir === rootDir
const addonStaticDir = path.join(rootDir, 'addon')
const addonConfigPath = path.join(rootDir, 'addon.config.mjs')
const sourceHandleEventsPath = path.join(addonStaticDir, 'handleEvents.json')
const installedHandleEventsPath = path.join(outDir, 'handleEvents.json')

function sanitizeMetadataValue(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => String(entry).trim()).filter(Boolean)
    }

    return typeof value === 'string' ? value.trim() : ''
}

async function loadAddonConfig() {
    const configUrl = new URL(pathToFileURL(addonConfigPath).href)
    configUrl.searchParams.set('ts', String(Date.now()))
    const module = await import(configUrl.href)

    return module.default
}

async function createMetadata() {
    const addonConfig = await loadAddonConfig()

    return {
        id: addonConfig.id,
        name: addonConfig.name,
        description: addonConfig.description,
        version: addonConfig.version,
        author: sanitizeMetadataValue(addonConfig.author),
        type: addonConfig.type,
        image: addonConfig.image || '',
        banner: addonConfig.banner || '',
        libraryLogo: addonConfig.libraryLogo || '',
        css: 'script.css',
        script: 'script.js',
        tags: Array.isArray(addonConfig.tags) ? addonConfig.tags : [],
        dependencies: Array.isArray(addonConfig.dependencies) ? addonConfig.dependencies : [],
        conflictsWith: Array.isArray(addonConfig.conflictsWith) ? addonConfig.conflictsWith : [],
        allowedUrls: Array.isArray(addonConfig.allowedUrls) ? addonConfig.allowedUrls : [],
        supportedVersions: Array.isArray(addonConfig.supportedVersions) ? addonConfig.supportedVersions : [],
    }
}

async function collectWatchEntries(dir, bucket = []) {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const stat = await fs.stat(fullPath)

        if (entry.isDirectory()) {
            await collectWatchEntries(fullPath, bucket)
        } else {
            bucket.push(`${path.relative(rootDir, fullPath)}:${stat.mtimeMs}:${stat.size}`)
        }
    }

    return bucket
}

async function buildStaticSignature() {
    const entries = await collectWatchEntries(addonStaticDir)
    const addonConfigStat = await fs.stat(addonConfigPath)

    entries.push(`${path.relative(rootDir, addonConfigPath)}:${addonConfigStat.mtimeMs}:${addonConfigStat.size}`)
    return entries.sort().join('|')
}

async function readFileIfExists(filePath) {
    try {
        return await fs.readFile(filePath, 'utf8')
    } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
    }
}

async function getStatIfExists(filePath) {
    try {
        return await fs.stat(filePath)
    } catch (error) {
        if (error?.code === 'ENOENT') return null
        throw error
    }
}

async function syncStaticAddonArtifacts() {
    const metadata = await createMetadata()
    const currentAddonConfig = await loadAddonConfig()
    const nextDirectoryName = String(currentAddonConfig?.directoryName || '').trim()

    if (nextDirectoryName && nextDirectoryName !== path.basename(outDir) && warnedDirectoryName !== nextDirectoryName) {
        warnedDirectoryName = nextDirectoryName
        console.warn(
            `addon.config.mjs directoryName changed to "${nextDirectoryName}". Restart yarn dev to switch output.`,
        )
    }

    await fs.mkdir(outDir, { recursive: true })
    await fs.cp(addonStaticDir, outDir, { recursive: true, force: true })
    await fs.writeFile(path.join(outDir, 'metadata.json'), JSON.stringify(metadata, null, 4) + '\n', 'utf8')
}

async function syncInstalledHandleEventsIfNeeded({ onlyWhenNewer = false } = {}) {
    const [installedStat, sourceStat] = await Promise.all([
        getStatIfExists(installedHandleEventsPath),
        getStatIfExists(sourceHandleEventsPath),
    ])

    if (!installedStat || (onlyWhenNewer && sourceStat && installedStat.mtimeMs <= sourceStat.mtimeMs)) return

    const installedSignature = `${installedStat.mtimeMs}:${installedStat.size}`
    if (!onlyWhenNewer && installedSignature === lastInstalledHandleEventsSignature) return

    lastInstalledHandleEventsSignature = installedSignature
    const [installedHandleEvents, sourceHandleEvents] = await Promise.all([
        readFileIfExists(installedHandleEventsPath),
        readFileIfExists(sourceHandleEventsPath),
    ])

    if (installedHandleEvents == null || installedHandleEvents === sourceHandleEvents) return

    await fs.writeFile(sourceHandleEventsPath, installedHandleEvents, 'utf8')
    lastStaticSignature = await buildStaticSignature()
    console.log('Synced handleEvents.json from installed addon back to source')
}

console.log(`Watching addon build into ${outDir}`)
if (inPlaceBuild) {
    console.log('In-place mode is safe: Vite will update generated files without emptying the source repository.')
}

let lastStaticSignature = ''
let lastInstalledHandleEventsSignature = ''
let staticSyncPromise = Promise.resolve()
let warnedDirectoryName = ''

await syncInstalledHandleEventsIfNeeded({ onlyWhenNewer: true })

const syncStaticIfNeeded = async (force) => {
    const nextSignature = await buildStaticSignature()
    if (!force && nextSignature === lastStaticSignature) return

    lastStaticSignature = nextSignature
    await syncStaticAddonArtifacts()
    const installedStat = await getStatIfExists(installedHandleEventsPath)
    lastInstalledHandleEventsSignature = installedStat ? `${installedStat.mtimeMs}:${installedStat.size}` : ''
    console.log('Synced static addon files')
}

await syncStaticIfNeeded(true)

const child = spawn(process.execPath, [viteBin, 'build', '--watch', '--mode', 'development'], {
    cwd: rootDir,
    env: {
        ...process.env,
        PULSESYNC_ADDON_OUT_DIR: outDir,
        PULSESYNC_ADDON_IN_PLACE: inPlaceBuild ? '1' : '0',
    },
    stdio: 'inherit',
})

const staticSyncTimer = setInterval(() => {
    staticSyncPromise = staticSyncPromise
        .then(() => syncInstalledHandleEventsIfNeeded())
        .then(() => syncStaticIfNeeded(false))
        .catch((error) => console.error('Failed to sync static addon files:', error))
}, 500)

const stop = (signal) => {
    clearInterval(staticSyncTimer)
    child.kill(signal)
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

child.on('exit', (code) => {
    clearInterval(staticSyncTimer)
    process.exitCode = code ?? 0
})
