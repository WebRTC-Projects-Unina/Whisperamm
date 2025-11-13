import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],

  // === IL BLOCCO SERVER VA QUI ===
  // (Dentro defineConfig, dopo i plugin)
  server: {
    proxy: {
      // Qualsiasi richiesta che inizia con /api...
      '/api': {
        // ...girala a questo indirizzo (il tuo server Express)
        target: 'http://localhost:8080', 
        changeOrigin: true,
      }
    }
  }
  // ===============================

}) // <-- La parentesi graffa e tonda di chiusura di defineConfig va alla fine