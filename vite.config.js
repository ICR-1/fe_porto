import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import Sitemap from 'vite-plugin-sitemap'

export default defineConfig({
  plugins: [
    react(),
    Sitemap({
      hostname: 'https://www.aufer.my.id',
      generateRobotsTxt: false, // pakai public/robots.txt buatan sendiri (plugin menimpanya)
      dynamicRoutes: ['/gamer-site'],
      exclude: ['/login', '/login/admin', '/dashboard'],
    }),
  ],
  server: {
    open: true,
    host: true
  }
})