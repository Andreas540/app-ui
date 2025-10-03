// src/lib/printManager.ts

export interface PrintableSection {
  id: string
  title: string
  element: HTMLElement
  selected: boolean
}

export interface PrintOptions {
  sections: PrintableSection[]
  sortBy?: 'default' | 'date' | 'amount'
  sortOrder?: 'asc' | 'desc'
}

export class PrintManager {
  private static currentOptions: PrintOptions | null = null
  private static onOpenDialog: ((options: PrintOptions) => void) | null = null

  /**
   * Register a callback to open the print dialog
   */
  static setDialogHandler(handler: (options: PrintOptions) => void) {
    this.onOpenDialog = handler
  }

  /**
   * Scan the current page for printable sections and open the dialog
   */
  static openPrintDialog() {
    const sections = this.detectPrintableSections()
    if (sections.length === 0) {
      alert('No printable content found on this page.')
      return
    }

    this.currentOptions = {
      sections,
      sortBy: 'default',
      sortOrder: 'asc',
    }

    this.onOpenDialog?.(this.currentOptions)
  }

  /**
   * Detect all elements marked as printable on the page
   */
  private static detectPrintableSections(): PrintableSection[] {
    const elements = document.querySelectorAll<HTMLElement>('[data-printable]')
    return Array.from(elements).map((el) => ({
      id:
        el.getAttribute('data-printable-id') ||
        `section-${Math.random().toString(36).slice(2)}`,
      title: el.getAttribute('data-printable-title') || 'Untitled Section',
      element: el,
      selected: true, // default to selected
    }))
  }

  /**
   * Print in an isolated document so pagination matches Preview and
   * isn't affected by app layout (vh, sticky, overflow, etc).
   * Keeps the 300ms cushion as requested.
   */
  static async print(options: PrintOptions) {
    // Give the UI a beat to settle after toggling selections (keep 300ms)
    await new Promise((r) => setTimeout(r, 300))

    // 1) Collect styles from current app
    const styleTags = Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
      .map(s => s.textContent || '')
      .join('\n')
    const linkTags = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    )
      .map(l => `<link rel="stylesheet" href="${l.href}">`)
      .join('\n')

    // 2) Collect selected sections (DOM order)
    const selectedHtml = Array.from(
      document.querySelectorAll<HTMLElement>('[data-printable]')
    )
      .map(el => {
        const id = el.getAttribute('data-printable-id') || ''
        const match = options.sections.find(s => s.id === id)
        return match && match.selected ? el.outerHTML : ''
      })
      .filter(Boolean)
      .join('\n')

    // 3) Build clean print HTML (same approach as Preview) and auto-print
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Print</title>
<base href="${document.baseURI}" />
${linkTags}
<style>
${styleTags}

/* Base normalization */
html, body {
  height: auto !important;
  overflow: visible !important;
  background: #fff !important;
  color: #000 !important;
  -webkit-font-smoothing: antialiased;
}
#print-root {
  display: block !important;
  max-width: 100% !important;
  overflow: visible !important;
  background: #fff !important;
}

/* Prevent clipping from app containers */
.card, .panel, .container, .row {
  overflow: visible !important;
  background: #fff !important;
}

/* Allow multi-page */
[data-printable] {
  display: block !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

/* Utilities */
.avoid-break { break-inside: avoid; page-break-inside: avoid; }
.force-break { break-before: page; page-break-before: always; }

/* Print rules */
@page { size: A4; margin: 12mm; }
@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff !important; color: #000 !important; }
  .print-hidden { display: none !important; }
  .card, .panel { box-shadow: none !important; border: none !important; }
  h3, h4 { break-after: avoid; page-break-after: avoid; }
}
</style>
</head>
<body>
<div id="print-root">
${selectedHtml || '<p>No sections selected.</p>'}
</div>
<script>
  // Give the browser a moment to paint, then open the print dialog
  setTimeout(function () { try { window.print(); } catch (e) {} }, 100);
</script>
</body>
</html>`

    // 4) Open the print document (new tab on desktop, same tab on iOS/PWA)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    if (isIOS || isStandalone) {
      window.location.href = url // same-tab is most reliable on iOS/PWA
    } else {
      const w = window.open(url, '_blank', 'noopener')
      if (!w) window.location.href = url // fallback if blocked
    }

    // Best-effort revoke after a while
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  /**
   * Generate a preview (new tab where possible, same-tab on iOS/PWA),
   * honoring selected sections and copying styles for visual parity.
   */
  static openPreview(options: PrintOptions) {
    // Collect app-injected styles
    const styleTags = Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
      .map(s => s.textContent || '')
      .join('\n')
    const linkTags = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`)
      .join('\n')

    // Collect selected sections (DOM order)
    const selectedHtml = Array.from(document.querySelectorAll<HTMLElement>('[data-printable]'))
      .map(el => {
        const id = el.getAttribute('data-printable-id') || ''
        const match = options.sections.find(s => s.id === id)
        return match && match.selected ? el.outerHTML : ''
      })
      .filter(Boolean)
      .join('\n')

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Print Preview</title>
<base href="${document.baseURI}" />
${linkTags}
<style>
${styleTags}

/* Base preview normalization (screen) */
html, body {
  height: auto !important;
  overflow: auto !important;
  background: #fff !important;
  color: #000 !important;
  -webkit-font-smoothing: antialiased;
}
#print-root {
  display: block !important;
  max-width: 100% !important;
  overflow: visible !important;
  background: #fff !important;
}

/* Prevent clipping from app containers */
.card, .panel, .container, .row {
  overflow: visible !important;
  background: #fff !important;
}

/* Ensure long content can paginate when the print dialog opens */
[data-printable] {
  display: block !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

/* Utilities */
.avoid-break { break-inside: avoid; page-break-inside: avoid; }
.force-break { break-before: page; page-break-before: always; }

/* Print-specific in the preview tab */
@page { size: A4; margin: 12mm; }
@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { background: #fff !important; color: #000 !important; }
  .print-hidden { display: none !important; }
  .card, .panel { box-shadow: none !important; border: none !important; }
  h3, h4 { break-after: avoid; page-break-after: avoid; }
}
</style>
</head>
<body>
<div id="print-root">
${selectedHtml || '<p>No sections selected.</p>'}
</div>
</body>
</html>`

    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    if (isIOS || isStandalone) {
      window.location.href = url // same tab (reliable on iOS/PWA)
    } else {
      const w = window.open(url, '_blank', 'noopener')
      if (!w) window.location.href = url // fallback if blocked
    }

    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}

