import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Read only this public setting; do not expose other unprefixed variables.
  const env = loadEnv(mode, process.cwd(), 'STAGE')
  const stage = process.env.STAGE ?? env.STAGE ?? (mode === 'preview' ? 'preview' : command === 'serve' ? 'local' : 'prod')
  if (!['local', 'preview', 'prod'].includes(stage)) {
    throw new Error('STAGE must be local, preview, or prod.')
  }
  return {
    plugins: [react()],
    define: { 'import.meta.env.STAGE': JSON.stringify(stage) },
  }
})
