import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'

import addonConfig from '../addon.config.mjs'
import { getPulseSyncAddonDir, getPulseSyncAddonsDir } from './pulsesync-paths.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(rootDir, 'dist', addonConfig.directoryName)
const runtimeSettingsFile = 'pulsesync.settings.json'

async function copyIntoSourceRepository(targetDir) {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true })

    for (const entry of entries) {
        const source = path.join(sourceDir, entry.name)
        const destination = path.join(targetDir, entry.name)

        if (entry.isDirectory()) {
            await fs.cp(source, destination, { recursive: true, force: true })
        } else {
            await fs.copyFile(source, destination)
        }
    }
}

async function main() {
    const targetRoot = getPulseSyncAddonsDir()
    const targetDir = getPulseSyncAddonDir()
    const runtimeSettingsPath = path.join(targetDir, runtimeSettingsFile)

    await fs.access(sourceDir)
    await fs.mkdir(targetRoot, { recursive: true })

    if (path.resolve(targetDir) === rootDir) {
        await copyIntoSourceRepository(targetDir)
        console.log(`Synced generated addon files in place without removing the source repository: ${targetDir}`)
        return
    }

    let runtimeSettings = null
    try {
        runtimeSettings = await fs.readFile(runtimeSettingsPath)
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error
    }

    await fs.rm(targetDir, { recursive: true, force: true })
    await fs.cp(sourceDir, targetDir, { recursive: true, force: true })

    if (runtimeSettings) {
        await fs.writeFile(runtimeSettingsPath, runtimeSettings)
    }

    console.log(`Synced addon to ${targetDir}`)
}

main().catch((error) => {
    console.error('Failed to sync addon:', error)
    process.exitCode = 1
})
