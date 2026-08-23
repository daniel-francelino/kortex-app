import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const sizes = [
  [1290, 2796],
  [1179, 2556],
  [1170, 2532],
  [1125, 2436],
  [1242, 2688],
  [828, 1792],
  [750, 1334],
  [640, 1136],
  [1536, 2048],
  [1668, 2224],
  [1668, 2388],
  [2048, 2732]
]

const iconPath = 'public/icons/icon-512x512.png'

await mkdir('public/splash', { recursive: true })

function splashSvg(width, height, iconSize, top) {
  const titleY = top + iconSize + Math.round(height * 0.055)
  const titleSize = Math.round(width * 0.07)
  const glowRadius = iconSize * 0.72

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bg" cx="50%" cy="36%" r="68%">
          <stop offset="0" stop-color="#063827"/>
          <stop offset="0.45" stop-color="#020b17"/>
          <stop offset="1" stop-color="#020618"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <circle cx="${width / 2}" cy="${height * 0.38}" r="${glowRadius}" fill="#12E39A" opacity="0.08"/>
      <text x="50%" y="${titleY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${titleSize}" font-weight="700" fill="#F8FAFC">Kortex</text>
    </svg>
  `)
}

for (const [width, height] of sizes) {
  const iconSize = Math.round(Math.min(width, height) * 0.23)
  const top = Math.round(height * 0.38 - iconSize / 2)
  const icon = await sharp(iconPath).resize(iconSize, iconSize).png().toBuffer()

  await sharp(splashSvg(width, height, iconSize, top))
    .composite([{
      input: icon,
      left: Math.round((width - iconSize) / 2),
      top
    }])
    .png()
    .toFile(`public/splash/apple-splash-${width}x${height}.png`)
}
