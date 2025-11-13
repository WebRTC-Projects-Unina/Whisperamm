import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  // === IL BLOCCO SERVER VA QUI ===
  //Qua però in teoria è solo per lo sviluppo, in prod lo dobbiamo togliere.
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

})