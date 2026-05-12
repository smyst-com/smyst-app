import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const logoPath = path.join(root, 'logo.svg')
const logoSvg = await fs.readFile(logoPath)

async function writePng(file, size) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await sharp(logoSvg).resize(size, size).png().toFile(file)
}

const androidSizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}

for (const [density, size] of Object.entries(androidSizes)) {
  const dir = path.join(root, `android/app/src/main/res/mipmap-${density}`)
  await writePng(path.join(dir, 'ic_launcher.png'), size)
  await writePng(path.join(dir, 'ic_launcher_round.png'), size)
  await writePng(path.join(dir, 'ic_launcher_foreground.png'), size)
}

await writePng(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), 1024)

const innerLogo = (await fs.readFile(logoPath, 'utf8')).replace(/<\/?svg[^>]*>/g, '')
const splashSvg = Buffer.from(`
<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
  <rect width="2732" height="2732" fill="#F8FAFC"/>
  <g transform="translate(1166 1166) scale(3.333333)">
    ${innerLogo}
  </g>
</svg>
`)

for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await sharp(splashSvg).png().toFile(path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset', name))
}

console.log('Generated app icons and splash assets.')
