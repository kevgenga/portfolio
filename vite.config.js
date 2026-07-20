import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/test-portfolio-mangaka/', // Assure que le chemin est correct
  server: {
    host: true, // Permet l'accès depuis d'autres appareils
    port: 5173, // Assure que le port reste le même
  },
})
