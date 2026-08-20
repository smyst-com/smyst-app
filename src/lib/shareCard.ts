/**
 * Antwort-Teilen (Phase 2 Master-Plan): erzeugt eine teilbare Karten-Grafik
 * (Canvas, 1080x1350) aus einer KI-Antwort und oeffnet den nativen
 * Teilen-Dialog (Web Share API Level 2). Fallback: Text in die
 * Zwischenablage. Jede Karte traegt smyst.com als Veranstalter-Marke.
 */

const CARD_WIDTH = 1080
const CARD_HEIGHT = 1350
const BRAND = 'smyst.com'
const CTA = 'Chatte mit KI-Persönlichkeiten auf smyst.com'

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.replace(/\s+/g, ' ').trim().split(' ')) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current)
      current = word
      if (lines.length === maxLines) return lines
    } else {
      current = candidate
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  if (lines.length === maxLines && current !== lines[maxLines - 1]) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, -1)}…`
  }
  return lines
}

export function renderShareCard(twinName: string, content: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    canvas.width = CARD_WIDTH
    canvas.height = CARD_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      reject(new Error('Canvas nicht verfügbar'))
      return
    }

    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT)
    gradient.addColorStop(0, '#0b1c44')
    gradient.addColorStop(1, '#173064')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT)

    ctx.fillStyle = '#59C7FF'
    ctx.font = '600 44px system-ui, -apple-system, sans-serif'
    ctx.fillText(twinName, 80, 140)

    ctx.fillStyle = 'rgba(89, 199, 255, 0.6)'
    ctx.font = '400 34px system-ui, -apple-system, sans-serif'
    ctx.fillText('KI-Zwilling', 80, 196)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.fillRect(80, 236, CARD_WIDTH - 160, 2)

    ctx.fillStyle = '#f4f7fb'
    ctx.font = '400 46px system-ui, -apple-system, sans-serif'
    const quote = `„${content.trim()}“`
    const lines = wrapText(ctx, quote, CARD_WIDTH - 160, 14)
    let y = 340
    for (const line of lines) {
      ctx.fillText(line, 80, y)
      y += 68
    }

    ctx.fillStyle = '#59C7FF'
    ctx.font = '700 44px system-ui, -apple-system, sans-serif'
    ctx.fillText(BRAND, 80, CARD_HEIGHT - 140)
    ctx.fillStyle = 'rgba(244, 247, 251, 0.75)'
    ctx.font = '400 30px system-ui, -apple-system, sans-serif'
    ctx.fillText(CTA, 80, CARD_HEIGHT - 90)

    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Karte konnte nicht erzeugt werden'))),
      'image/png',
    )
  })
}

export function buildShareText(twinName: string, content: string): string {
  return `${twinName} (KI-Zwilling) auf smyst.com:\n\n„${content.trim()}“\n\nChatte selbst mit KI-Persönlichkeiten: https://smyst.com`
}

export type ShareOutcome = 'shared' | 'copied' | 'failed'

export async function shareTwinAnswer(twinName: string, content: string): Promise<ShareOutcome> {
  const shareData: ShareData = {
    title: `${twinName} | smyst.com`,
    text: buildShareText(twinName, content),
  }
  try {
    const blob = await renderShareCard(twinName, content)
    const file = new File([blob], `smyst-${twinName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`, {
      type: 'image/png',
    })
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ ...shareData, files: [file] })
      return 'shared'
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
  }
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData)
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared'
    }
  }
  try {
    await navigator.clipboard.writeText(buildShareText(twinName, content))
    return 'copied'
  } catch {
    return 'failed'
  }
}
