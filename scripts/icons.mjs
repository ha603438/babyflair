// Génère les icônes PWA depuis le logo fourni : node scripts/icons.mjs
// - apple-touch-icon / pwa-192 / pwa-512 : logo recadré (public/logo.png), fond noir, sans marge blanche
// - maskable-icon-512 : logo réduit dans la zone sûre (80 %) sur fond noir
import sharp from 'sharp'

const SRC = 'public/logo.png'
const BLACK = '#000000'
const out = (name, size, inner) =>
  sharp(SRC).resize(inner, inner).extend({
    top: Math.round((size - inner) / 2), bottom: Math.round((size - inner) / 2),
    left: Math.round((size - inner) / 2), right: Math.round((size - inner) / 2), background: BLACK,
  }).png().toFile(`public/${name}`)

await out('apple-touch-icon-180x180.png', 180, 180)
await out('pwa-64x64.png', 64, 64)
await out('pwa-192x192.png', 192, 192)
await out('pwa-512x512.png', 512, 512)
await out('maskable-icon-512x512.png', 512, 410)
await sharp(SRC).resize(48, 48).png().toFile('public/favicon-48.png')
console.log('icônes générées')
