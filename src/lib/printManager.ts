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
      // CHANGE 1: ensure a stable id is present on the DOM element itself
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

    // CHANGE 2: more robust lookup for sections and their row containers
    const selectContainer = (sectionEl: Element | null): Element | null => {
      if (!sectionEl) return null
      return (
        sectionEl.querySelector('[data-print-rows]') ||               // explicit hook if present
        sectionEl.querySelector('[style*="display:grid"]') ||         // legacy inline style
        sectionEl                                                     // fallback: direct children are rows
      )
    }

    const ordersSection =
      doc.querySelector('[data-printable-id="orders"], [data-printable-section="orders"]')
    const paymentsSection =
      doc.querySelector('[data-printable-id="payments"], [data-printable-section="payments"]')

    if (ordersSection) {
      const container = selectContainer(ordersSection)
      if (container) this.processRows(container, settings, 'orders')
    }

    if (paymentsSection) {
      const container = selectContainer(paymentsSection)
      if (container) this.processRows(container, settings, 'payments')
    }

    // Fallback: if no named sections were found, process any generic printable sections
    // so sorting/filtering still applies to the selected blocks the user chose.
    if (!ordersSection && !paymentsSection) {
      const genericSections = Array.from(doc.querySelectorAll('[data-printable]'))
      for (const sec of genericSections) {
        const container = selectContainer(sec)
        if (container) {
          // Assume 'orders' shape to enable customer sorting when requested.
          // (Payments sorting by customer is skipped by type check inside processRows.)
          this.processRows(container, settings, 'orders')
        }
      }
    }

    return doc.body.innerHTML
  }

  private static processRows(
    container: Element,
    settings: PrintSettings,
    type: 'orders' | 'payments'
  ) {
    const rows = Array.from(container.children) as HTMLElement[]
    
    // Filter by date if "last 3 months" is selected
    const filteredRows = settings.lastThreeMonths
      ? this.filterLastThreeMonths(rows)
      : rows

    // Remove filtered out rows from DOM
    rows.forEach(row => {
      if (!filteredRows.includes(row)) {
        row.remove()
      }
    })

    // Sort remaining rows
    let sortedRows = [...filteredRows]
    
    if (settings.sortByDate) {
      sortedRows = this.sortByDate(sortedRows)
    } else if (settings.sortByCustomer && type === 'orders') {
      sortedRows = this.sortByCustomer(sortedRows)
    }

    // Reorder DOM elements
    sortedRows.forEach(row => {
      container.appendChild(row)
    })
  }

  private static filterLastThreeMonths(rows: HTMLElement[]): HTMLElement[] {
    const threeMonthsAgo = new Date()
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    return rows.filter(row => {
      const dateStr = this.extractDate(row)
      if (!dateStr) return true
      
      const rowDate = this.parseDate(dateStr)
      return rowDate && rowDate >= threeMonthsAgo
    })
  }

  private static sortByDate(rows: HTMLElement[]): HTMLElement[] {
    return rows.sort((a, b) => {
      const dateA = this.parseDate(this.extractDate(a))
      const dateB = this.parseDate(this.extractDate(b))
      
      if (!dateA || !dateB) return 0
      return dateB.getTime() - dateA.getTime() // Newest first
    })
  }

  private static sortByCustomer(rows: HTMLElement[]): HTMLElement[] {
    return rows.sort((a, b) => {
      const customerA = this.extractCustomerName(a)
      const customerB = this.extractCustomerName(b)
      
      return customerA.localeCompare(customerB)
    })
  }

  private static extractDate(row: HTMLElement): string {
    const firstChild = row.children[0] as HTMLElement
    return firstChild?.textContent?.trim() || ''
  }

  private static extractCustomerName(row: HTMLElement): string {
    const secondChild = row.children[1] as HTMLElement
    return secondChild?.textContent?.trim() || ''
  }

  private static parseDate(dateStr: string): Date | null {
    if (!dateStr) return null
    
    // Expected format: "9/29/25" or "MM/DD/YY"
    const parts = dateStr.split('/')
    if (parts.length !== 3) return null
    
    const month = parseInt(parts[0], 10) - 1
    const day = parseInt(parts[1], 10)
    let year = parseInt(parts[2], 10)
    
    // Convert 2-digit year to 4-digit
    if (year < 100) {
      year += 2000
    }
    
    const date = new Date(year, month, day)
    return isNaN(date.getTime()) ? null : date
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
    let selectedHtml = Array.from(
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
    selectedHtml = this.processContent(selectedHtml, options)

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
${selectedHtml || '<p>No sections selected.</p>'}
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



