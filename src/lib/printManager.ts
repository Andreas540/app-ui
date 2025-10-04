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

// Extended settings passed from PrintDialog
export interface PrintSettings extends PrintOptions {
  includeAll?: boolean
  lastThreeMonths?: boolean
  sortByDate?: boolean
  sortByCustomer?: boolean
}

export class PrintManager {
  private static currentOptions: PrintOptions | null = null
  private static onOpenDialog: ((options: PrintOptions) => void) | null = null

  static setDialogHandler(handler: (options: PrintOptions) => void) {
    this.onOpenDialog = handler
  }

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

  private static detectPrintableSections(): PrintableSection[] {
    const elements = document.querySelectorAll<HTMLElement>('[data-printable]')
    return Array.from(elements).map((el) => {
      // ensure a stable id exists on the DOM element itself
      let id = el.getAttribute('data-printable-id')
      if (!id) {
        id = `section-${Math.random().toString(36).slice(2)}`
        el.setAttribute('data-printable-id', id)
      }

      return {
        id,
        title: el.getAttribute('data-printable-title') || 'Untitled Section',
        element: el,
        selected: true,
      }
    })
  }

  /**
   * Filter and sort HTML content based on settings
   */
  private static processContent(html: string, settings: PrintSettings): string {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // helper to find the rows container inside a section
    const selectContainer = (sectionEl: Element | null): Element | null => {
      if (!sectionEl) return null
      return (
        sectionEl.querySelector('[data-print-rows]') ||       // explicit hook (recommended)
        sectionEl.querySelector('[style*="display:grid"]') || // legacy inline style
        sectionEl                                             // fallback: section’s direct children
      )
    }

    const ordersSection =
      doc.querySelector('[data-printable-id="orders"], [data-printable-section="orders"]')
    const paymentsSection =
      doc.querySelector('[data-printable-id="payments"], [data-printable-section="payments"]')

    let touched = false

    if (ordersSection) {
      const container = selectContainer(ordersSection)
      if (container) {
        this.processRows(container, settings, 'orders')
        touched = true
      }
    }

    if (paymentsSection) {
      const container = selectContainer(paymentsSection)
      if (container) {
        this.processRows(container, settings, 'payments')
        touched = true
      }
    }

    // Fallback: if no named sections exist, still process generic printable blocks
    if (!touched) {
      const genericSections = Array.from(doc.querySelectorAll('[data-printable]'))
      for (const sec of genericSections) {
        const container = selectContainer(sec)
        if (container) this.processRows(container, settings, 'orders')
      }
    }

    return doc.body.innerHTML
  }

  // Prefer explicit row hooks if present (avoids reordering headers/footers)
  private static getRowElements(container: Element): { rows: HTMLElement[]; explicit: boolean } {
    const explicitRows = Array.from(container.querySelectorAll<HTMLElement>('[data-print-row]'))
    if (explicitRows.length > 0) return { rows: explicitRows, explicit: true }
    const direct = Array.from(container.children) as HTMLElement[]
    return { rows: direct, explicit: false }
  }

  private static processRows(
    container: Element,
    settings: PrintSettings,
    type: 'orders' | 'payments'
  ) {
    const { rows, explicit } = this.getRowElements(container)
    if (rows.length === 0) return

    // ---- Filtering (safe): only remove if lastThreeMonths is ON and we actually parsed dates
    let filteredRows = rows
    let usedFilter = false

    if (settings.lastThreeMonths) {
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

      const tmp = rows.filter(row => {
        const dateStr = this.extractDate(row)
        const rowDate = this.parseDate(dateStr)
        // keep rows with no date (don’t accidentally drop headers/notes)
        if (!dateStr || !rowDate) return true
        return rowDate >= threeMonthsAgo
      })

      // apply filter only if it actually changed the set (prevents accidental wipes)
      if (tmp.length > 0 && tmp.length <= rows.length) {
        filteredRows = tmp
        usedFilter = tmp.length !== rows.length
      }
    }

    // ---- Sorting
    let sortedRows = [...filteredRows]
    if (settings.sortByDate) {
      sortedRows = this.sortByDate(sortedRows)
    } else if (settings.sortByCustomer && type === 'orders') {
      sortedRows = this.sortByCustomer(sortedRows)
    }

    // ---- Write back to DOM safely
    // If we had explicit row hooks, remove only those; keep headers/footers untouched.
    if (explicit) {
      // Remove only managed rows from DOM
      rows.forEach(r => r.remove())
      // Append back in new order
      const frag = document.createDocumentFragment()
      sortedRows.forEach(r => frag.appendChild(r))
      container.appendChild(frag)
    } else {
      // No explicit hooks: do NOT remove anything.
      // Just move known rows to the end in sorted order (keeps non-row children intact).
      // This may reorder where rows appear, but it won't blank the page.
      sortedRows.forEach(r => container.appendChild(r))
      // If a filter was used and actually reduced rows, we can (carefully) remove the ones not in filteredRows.
      if (usedFilter) {
        const keep = new Set(filteredRows)
        rows.forEach(r => { if (!keep.has(r)) r.remove() })
      }
    }
  }

  private static sortByDate(rows: HTMLElement[]): HTMLElement[] {
    return rows.slice().sort((a, b) => {
      const aDate = this.parseDate(this.extractDate(a))
      const bDate = this.parseDate(this.extractDate(b))
      if (!aDate && !bDate) return 0
      if (!aDate) return 1
      if (!bDate) return -1
      return bDate.getTime() - aDate.getTime() // Newest first
    })
  }

  private static sortByCustomer(rows: HTMLElement[]): HTMLElement[] {
    return rows.slice().sort((a, b) => {
      const aName = this.extractCustomerName(a)
      const bName = this.extractCustomerName(b)
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' })
    })
  }

  // --- extraction helpers ---

  private static extractDate(row: HTMLElement): string {
    // Prefer explicit attribute
    const attr = (row.querySelector('[data-date]') as HTMLElement | null)?.getAttribute('data-date')
    if (attr) return attr.trim()

    // Fallback: first immediate child text
    const firstChild = row.children[0] as HTMLElement | undefined
    return firstChild?.textContent?.trim() || ''
  }

  private static extractCustomerName(row: HTMLElement): string {
    const byAttr = (row.querySelector('[data-customer]') as HTMLElement | null)?.getAttribute('data-customer')
    if (byAttr) return byAttr.trim()

    const byClass = (row.querySelector('.customer') as HTMLElement | null)?.textContent
    if (byClass) return byClass.trim()

    const byCol = (row.querySelector('[data-col="customer"]') as HTMLElement | null)?.textContent
    if (byCol) return byCol.trim()

    // Fallback: second immediate child text
    const secondChild = row.children[1] as HTMLElement | undefined
    return secondChild?.textContent?.trim() || ''
  }

  private static parseDate(dateStr: string): Date | null {
    if (!dateStr) return null

    // ISO or RFC-ish first
    const iso = new Date(dateStr)
    if (!isNaN(iso.getTime())) return iso

    // M/D/YY or M/D/YYYY
    const slash = dateStr.split('/')
    if (slash.length === 3) {
      const month = parseInt(slash[0], 10) - 1
      const day = parseInt(slash[1], 10)
      let year = parseInt(slash[2], 10)
      if (year < 100) year += 2000
      const d = new Date(year, month, day)
      return isNaN(d.getTime()) ? null : d
    }

    return null
  }

  /**
   * Print with filtering and sorting applied
   */
  static async print(options: PrintSettings) {
    await new Promise((r) => setTimeout(r, 300))

    // Collect styles
    const styleTags = Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
      .map(s => s.textContent || '')
      .join('\n')
    const linkTags = Array.from(
      document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    )
      .map(l => `<link rel="stylesheet" href="${l.href}">`)
      .join('\n')

    // Collect selected sections
    const originalSelectedHtml = Array.from(
      document.querySelectorAll<HTMLElement>('[data-printable]')
    )
      .map(el => {
        const id = el.getAttribute('data-printable-id') || ''
        const match = options.sections.find(s => s.id === id)
        return match && match.selected ? el.outerHTML : ''
      })
      .filter(Boolean)
      .join('\n')

    // Apply filtering and sorting to the HTML
    let processedHtml = this.processContent(originalSelectedHtml, options)
    if (!processedHtml || processedHtml.trim() === '') {
      // Safety net: never ship an empty print page
      processedHtml = originalSelectedHtml || '<p>No sections selected.</p>'
    }

    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Print</title>
<base href="${document.baseURI}" />
${linkTags}
<style>
${styleTags}

html, body {
  height: auto !important;
  overflow: visible !important;
  background: #fff !important;
  color: #000 !important;
  -webkit-font-smoothing: antialiased;
}

#print-root,
#print-root * {
  color: #000 !important;
  -webkit-text-fill-color: #000 !important;
  opacity: 1 !important;
}
#print-root a, #print-root a:visited {
  color: #000 !important;
  text-decoration: none;
}

#print-root {
  display: block !important;
  max-width: 100% !important;
  overflow: visible !important;
  background: #fff !important;
}

.card, .panel, .container, .row {
  overflow: visible !important;
  background: #fff !important;
}

[data-printable] {
  display: block !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.avoid-break { break-inside: avoid; page-break-inside: avoid; }
.force-break { break-before: page; page-break-before: always; }

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
${processedHtml}
</div>
<script>
  setTimeout(function () { try { window.print(); } catch (e) {} }, 100);
</script>
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
      window.location.href = url
    } else {
      const w = window.open(url, '_blank', 'noopener')
      if (!w) window.location.href = url
    }

    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  static openPreview(options: PrintOptions) {
    const styleTags = Array.from(document.querySelectorAll<HTMLStyleElement>('style'))
      .map(s => s.textContent || '')
      .join('\n')
    const linkTags = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
      .map(l => `<link rel="stylesheet" href="${l.href}">`)
      .join('\n')

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

html, body {
  height: auto !important;
  overflow: auto !important;
  background: #fff !important;
  color: #000 !important;
  -webkit-font-smoothing: antialiased;
}

#print-root,
#print-root * {
  color: #000 !important;
  -webkit-text-fill-color: #000 !important;
  opacity: 1 !important;
}
#print-root a, #print-root a:visited {
  color: #000 !important;
  text-decoration: none;
}

#print-root {
  display: block !important;
  max-width: 100% !important;
  overflow: visible !important;
  background: #fff !important;
}

.card, .panel, .container, .row {
  overflow: visible !important;
  background: #fff !important;
}

[data-printable] {
  display: block !important;
  break-inside: auto !important;
  page-break-inside: auto !important;
}

.avoid-break { break-inside: avoid; page-break-inside: avoid; }
.force-break { break-before: page; page-break-before: always; }

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
      window.location.href = url
    } else {
      const w = window.open(url, '_blank', 'noopener')
      if (!w) window.location.href = url
    }

    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}





