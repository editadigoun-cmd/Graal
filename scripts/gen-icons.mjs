import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const markSvg = readFileSync(path.join(root, 'src/assets/logo-mark.svg'), 'utf-8')

const targets = [
  { file: 'public/icons/icon-192.png', size: 192, bg: '#FFFFFF', pad: 0.14 },
  { file: 'public/icons/icon-512.png', size: 512, bg: '#FFFFFF', pad: 0.14 },
  { file: 'public/icons/maskable-512.png', size: 512, bg: '#154BAD', pad: 0.28 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, bg: '#FFFFFF', pad: 0.16 }
]

function htmlFor(size, bg, pad) {
  const inner = Math.round(size * (1 - pad * 2))
  return `<!doctype html><html><head><style>
    html,body{margin:0;padding:0;}
    .wrap{width:${size}px;height:${size}px;background:${bg};display:flex;align-items:center;justify-content:center;}
    .wrap svg{width:${inner}px;height:${inner}px;}
  </style></head><body><div class="wrap">${markSvg}</div></body></html>`
}

const browser = await chromium.launch()
const page = await browser.newPage()

mkdirSync(path.join(root, 'public/icons'), { recursive: true })

for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size })
  await page.setContent(htmlFor(t.size, t.bg, t.pad))
  const el = await page.$('.wrap')
  await el.screenshot({ path: path.join(root, t.file) })
  console.log('generated', t.file)
}

// Favicon (svg passthrough, but also a small png)
await page.setViewportSize({ width: 64, height: 64 })
await page.setContent(htmlFor(64, '#FFFFFF', 0.1))
const favEl = await page.$('.wrap')
await favEl.screenshot({ path: path.join(root, 'public/icons/favicon-64.png') })

await browser.close()

writeFileSync(path.join(root, 'public/icons/favicon.svg'), markSvg)
console.log('done')
