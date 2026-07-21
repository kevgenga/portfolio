import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { rm } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

function excludeInternalPublicTools() {
  let projectRoot
  let outputDirectory

  return {
    name: 'exclude-internal-public-tools',
    apply: 'build',
    configResolved(config) {
      projectRoot = config.root
      outputDirectory = config.build.outDir
    },
    async closeBundle() {
      const outputRoot = resolve(projectRoot, outputDirectory)
      const internalTools = resolve(outputRoot, 'assets', 'illustration', 'rename')
      const relativeTarget = relative(outputRoot, internalTools)

      if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) {
        throw new Error('Le dossier des outils internes est hors du dossier de build.')
      }

      await rm(internalTools, { recursive: true, force: true })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), excludeInternalPublicTools()],
  base: '/portfolio/',
  server: {
    host: true, // Permet l'accès depuis d'autres appareils
    port: 5173, // Assure que le port reste le même
  },
})
