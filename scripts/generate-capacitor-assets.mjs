import sharp from 'sharp'
import { copyFile, mkdir } from 'node:fs/promises'

// Source images for `@capacitor/assets generate`, which reads this folder
// and writes the native icon/splash-screen assets into ios/App and
// android/app once those native projects exist (run after `cap add ios` /
// `cap add android`, or as part of `cap:sync` — see package.json).
//
// Without these, Capacitor scaffolds its own generic template icon/splash
// into the native projects, which is why the app previously showed a
// blank/default splash on a real iOS build instead of the Kortex artwork.

await mkdir('resources', { recursive: true })

// ─── App icon: crisp 1024x1024 render straight from the source SVG ────────
// The SVG already draws its own rounded-rect background (rx=20), which
// leaves the corners transparent outside that shape. iOS requires app
// icons to have NO alpha channel — Xcode/App Store Connect reject icons
// with transparency — and applies its own corner mask on top of whatever
// square image it's given, so a pre-rounded, alpha-carrying source
// produces a double-rounded/transparent-corner icon. Flattening onto the
// SVG's own background color turns it back into a fully opaque square,
// letting iOS (and Android's adaptive icon masking) apply the rounding.
await sharp('public/icons/kortex-icon.svg')
  .resize(1024, 1024)
  .flatten({ background: '#020618' })
  .png()
  .toFile('resources/icon.png')

// ─── Splash screen: same dark radial-gradient + centered mark used for the
// iOS "Add to Home Screen" splash screens (scripts/generate-ios-splash.mjs),
// rendered at the 2732x2732 canvas @capacitor/assets expects. It crops this
// down per-device while keeping the mark centered on every screen size.
const SIZE = 2732
const iconSize = Math.round(SIZE * 0.23)
const top = Math.round(SIZE * 0.38 - iconSize / 2)
const titleY = top + iconSize + Math.round(SIZE * 0.055)
const titleSize = Math.round(SIZE * 0.07)
const glowRadius = iconSize * 0.72

const splashSvg = Buffer.from(`
  <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="36%" r="68%">
        <stop offset="0" stop-color="#063827"/>
        <stop offset="0.45" stop-color="#020b17"/>
        <stop offset="1" stop-color="#020618"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <circle cx="${SIZE / 2}" cy="${SIZE * 0.38}" r="${glowRadius}" fill="#12E39A" opacity="0.08"/>
    <text x="50%" y="${titleY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${titleSize}" font-weight="700" fill="#F8FAFC">Kortex</text>
  </svg>
`)

const icon = await sharp('public/icons/icon-512x512.png').resize(iconSize, iconSize).png().toBuffer()

await sharp(splashSvg)
  .composite([{
    input: icon,
    left: Math.round((SIZE - iconSize) / 2),
    top
  }])
  .flatten({ background: '#020618' })
  .png()
  .toFile('resources/splash.png')

// Kortex's splash is always dark regardless of system theme — Android's
// install-time splash still looks for `splash-dark.png` explicitly, so
// keep it identical rather than leaving it missing.
await copyFile('resources/splash.png', 'resources/splash-dark.png')

console.log('Generated resources/icon.png, resources/splash.png, resources/splash-dark.png')
