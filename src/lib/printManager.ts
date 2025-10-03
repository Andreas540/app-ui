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
   * Apply selections and trigger the browser print dialog.
   * Relies on print.css (imported globally) that hides `.print-hidden` in @media print.
   */
  static async print(options: PrintOptions) {
    // Apply visibility based on selections
    options.sections.forEach((section) => {
      section.element.classList.toggle('print-hidden', !section.selected)
    })

    document.body.classList.add('printing')

    // Let the browser apply styles/layout before printing
    await new Promise((r) => setTimeout(r, 100))

    const cleanup = () => {
      document.body.classList.remove('printing')
      options.sections.forEach((section) => {
        section.element.classList.remove('print-hidden')
      })
      window.removeEventListener('afterprint', cleanup)
    }

    // Prefer reliable cleanup via afterprint (with a fallback)
    window.addEventListener('afterprint', cleanup)
    window.print()
    setTimeout(cleanup, 1500)
  }

  /**
   * Generate a preview in a new tab, honoring section selections.
   * Builds a full HTML document as a Blob and opens its URL.
   * Copies all styles (<style> and <link rel="stylesheet">) so it looks like the app.
   */
  static openPreview(options: PrintOptions) {
    // 1) Collect styles from current document
    const styleTags = Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
      .map((s) => s.textContent || '')
      .join('\n')

    const linkTags = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    )
      .map((l) => `<link rel="stylesheet" href="${l.href}">`)
      .join('\n')

    // 2) Collect selected printable sections in DOM order
    const selectedHtml = Array.from(
      document.querySelectorAll<HTMLElement>('[data-printable]')
    )
      .map((el) => {
        const id = el.getAttribute('data-printable-id') || ''
        const match = options.sections.find((s) => s.id === id)
        if (match && match.selected) return el.outerHTML
        return ''
      })
      .filter(Boolean)
      .join('\n')

    // 3) Build full HTML (include <base> so relative URLs resolve)
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Print Preview</title>
<base href="${document.baseURI}" />
${linkTags}
<style>
${styleTags}
/* ensure hidden sections stay hidden in preview too */
.print-hidden { display: none !important; }
body { background: white; color: black; }
</style>
</head>
<body>
<div id="print-root">
${selectedHtml || '<p>No sections selected.</p>'}
</div>
</body>
</html>`

    // 4) Create a Blob URL and open it (most reliable way to avoid blank window)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)

    // Open synchronously from the click handler to minimize popup blocking
    // Use '_blank' with minimal features
    const w = window.open(url, '_blank', 'noopener')
    if (!w) {
      // If still blocked, give a hint to allow popups for localhost
      alert('Popup blocked. Please allow pop-ups for this site and try again.')
    }

    // Optional: auto-open the print dialog in the preview tab
    // setTimeout(() => { try { w?.print() } catch {} }, 300)

    // Revoke URL when the tab is closed (best-effort)
    const revoke = () => URL.revokeObjectURL(url)
    // We can't listen for the child unload directly; leave GC to handle if needed.
    setTimeout(revoke, 60_000) // revoke after 60s as a fallback
  }
}
