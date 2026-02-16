import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

/**
 * Parse import/export specifiers from a block like:
 *   app, BrowserWindow as BW
 */
function parseSpecifiers(raw: string): Array<{ original: string; alias: string | null }> {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const asMatch = item.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/)
      if (asMatch) {
        return { original: asMatch[1], alias: asMatch[2] }
      }
      return { original: item, alias: null }
    })
    .filter((item) => /^[A-Za-z_$][\w$]*$/.test(item.original))
}

/**
 * Fix ESM/CJS interop for Electron's CJS-only modules when bundling as ESM.
 * Rewrites named imports/re-exports to default-import destructuring.
 */
function electronCjsInteropPlugin(): Plugin {
  const CJS_EXTERNALS = ['electron', 'electron/main', 'electron/common']

  return {
    name: 'electron-cjs-interop',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const fileName in bundle) {
        const chunk = bundle[fileName]
        if (chunk.type !== 'chunk') continue

        let code = chunk.code
        let changed = false
        const collected = new Map<string, {
          defaultAliases: Set<string>
          namedBindings: Map<string, string>
        }>()

        const ensureModuleRecord = (mod: string) => {
          if (!collected.has(mod)) {
            collected.set(mod, {
              defaultAliases: new Set<string>(),
              // key: local binding name, value: original imported name
              namedBindings: new Map<string, string>(),
            })
          }
          return collected.get(mod)!
        }

        const addNamedBinding = (mod: string, original: string, alias: string | null) => {
          const record = ensureModuleRecord(mod)
          const local = alias || original
          if (!record.namedBindings.has(local)) {
            record.namedBindings.set(local, original)
          }
        }

        let reExportCounter = 0
        for (const mod of CJS_EXTERNALS) {
          const escMod = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const namedImportRegex = new RegExp(
            `import\\s*\\{([^}]*)\\}\\s*from\\s*["']${escMod}["']\\s*;?`,
            'g'
          )
          const mixedImportRegex = new RegExp(
            `import\\s+([A-Za-z_$][\\w$]*)\\s*,\\s*\\{([^}]*)\\}\\s*from\\s*["']${escMod}["']\\s*;?`,
            'g'
          )
          const reExportRegex = new RegExp(
            `export\\s*\\{([^}]*)\\}\\s*from\\s*["']${escMod}["']\\s*;?`,
            'g'
          )

          code = code.replace(mixedImportRegex, (_full, defaultName: string, rawNamed: string) => {
            const record = ensureModuleRecord(mod)
            record.defaultAliases.add(defaultName)
            for (const spec of parseSpecifiers(rawNamed)) {
              addNamedBinding(mod, spec.original, spec.alias)
            }
            changed = true
            return ''
          })

          code = code.replace(namedImportRegex, (_full, rawNamed: string) => {
            for (const spec of parseSpecifiers(rawNamed)) {
              addNamedBinding(mod, spec.original, spec.alias)
            }
            changed = true
            return ''
          })

          code = code.replace(reExportRegex, (_full, rawExports: string) => {
            const lines: string[] = []
            for (const spec of parseSpecifiers(rawExports)) {
              const exportedName = spec.alias || spec.original
              const local = `__rexp_${mod.replace(/\W/g, '_')}_${reExportCounter++}`
              addNamedBinding(mod, spec.original, local)
              lines.push(`export { ${local} as ${exportedName} };`)
            }
            if (lines.length > 0) {
              changed = true
              return lines.join('\n')
            }
            return ''
          })
        }

        if (!changed || collected.size === 0) {
          continue
        }

        let preamble = ''
        for (const [mod, record] of collected) {
          const internal = `__${mod.replace(/\W/g, '_')}__`
          preamble += `import ${internal} from "${mod}";\n`
          if (record.namedBindings.size > 0) {
            const destructured = [...record.namedBindings.entries()]
              .map(([local, original]) => (local === original ? original : `${original}: ${local}`))
              .join(', ')
            preamble += `const { ${destructured} } = ${internal};\n`
          }
          for (const alias of record.defaultAliases) {
            preamble += `const ${alias} = ${internal};\n`
          }
        }

        chunk.code = preamble + code
      }
    }
  }
}

/**
 * Load environment variables from .env.local
 * These will be injected at build time via `define`
 */
function loadEnvLocal(): Record<string, string> {
  const envPath = resolve(__dirname, '.env.local')
  const env: Record<string, string> = {}

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue

      const eqIndex = trimmed.indexOf('=')
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex).trim()
        let value = trimmed.slice(eqIndex + 1).trim()
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key] = value
      }
    }
  }

  return env
}

const envLocal = loadEnvLocal()

/**
 * Build-time injected analytics config
 * In open-source builds without .env.local, these will be empty strings (analytics disabled)
 */
const analyticsDefine = {
  '__HALO_GA_MEASUREMENT_ID__': JSON.stringify(envLocal.HALO_GA_MEASUREMENT_ID || ''),
  '__HALO_GA_API_SECRET__': JSON.stringify(envLocal.HALO_GA_API_SECRET || ''),
  '__HALO_BAIDU_SITE_ID__': JSON.stringify(envLocal.HALO_BAIDU_SITE_ID || ''),
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        // Include @electron-toolkit/utils in the bundle so our interop plugin can transform its electron imports
        exclude: ['@electron-toolkit/utils']
      }),
      electronCjsInteropPlugin()
    ],
    define: analyticsDefine,
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // File watcher worker — runs in a separate child process
          'worker/file-watcher/index': resolve(__dirname, 'src/worker/file-watcher/index.ts')
        },
        output: {
          format: 'es',
          entryFileNames: '[name].mjs'
        }
      }
    }
  },
  preload: {
    plugins: [
      externalizeDepsPlugin(),
      electronCjsInteropPlugin()
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        output: {
          format: 'es',
          entryFileNames: '[name].mjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer')
      }
    }
  }
})
