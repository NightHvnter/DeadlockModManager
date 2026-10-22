// Disegna resources/icon.svg con Chromium (Electron) e genera build/icon.png, build/icon.ico,
// build/icon.icns (per electron-builder) e resources/icon.png (finestra dell'app).
// Uso: npm run icons
import { app, BrowserWindow, nativeImage } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const project = join(import.meta.dirname, '..')
const svg = readFileSync(join(project, 'resources', 'icon.svg'), 'utf8')

async function render(win, size) {
  const html = `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`
  win.setContentSize(size, size)
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'))
  await new Promise((r) => setTimeout(r, 150))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  return image.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

// ICO con le immagini in PNG (supportato da Windows Vista in poi)
function ico(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)
  const entries = []
  const datas = []
  let offset = 6 + 16 * pngs.length
  for (const { size, png } of pngs) {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1)
    e.writeUInt16LE(1, 4)
    e.writeUInt16LE(32, 6)
    e.writeUInt32LE(png.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += png.length
    entries.push(e)
    datas.push(png)
  }
  return Buffer.concat([header, ...entries, ...datas])
}

// ICNS con le immagini in PNG, per tipo
function icns(byType) {
  const chunks = byType.map(([type, png]) => {
    const h = Buffer.alloc(8)
    h.write(type, 0, 'ascii')
    h.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([h, png])
  })
  const body = Buffer.concat(chunks)
  const h = Buffer.alloc(8)
  h.write('icns', 0, 'ascii')
  h.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([h, body])
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  win.webContents.setZoomFactor(1)
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
  const png = {}
  for (const s of sizes) png[s] = await render(win, s)

  const build = join(project, 'build')
  mkdirSync(build, { recursive: true })
  writeFileSync(join(build, 'icon.png'), png[1024])
  writeFileSync(join(project, 'resources', 'icon.png'), png[512])
  writeFileSync(
    join(build, 'icon.ico'),
    ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: png[size] })))
  )
  writeFileSync(
    join(build, 'icon.icns'),
    icns([
      ['icp4', png[16]],
      ['icp5', png[32]],
      ['icp6', png[64]],
      ['ic07', png[128]],
      ['ic08', png[256]],
      ['ic09', png[512]],
      ['ic10', png[1024]]
    ])
  )
  console.log(
    'icone generate:',
    sizes.map((s) => nativeImage.createFromBuffer(png[s]).getSize().width).join(', '),
    'px'
  )
  app.exit(0)
})
