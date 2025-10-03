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
      sortOrder: 'asc'
    }

    if (this.onOpenDialog) {
      this.onOpenDialog(this.currentOptions)
    }
  }

  /**
   * Detect all elements marked as printable on the page
   */
  private static detectPrintableSections(): PrintableSection[] {
    const elements = document.querySelectorAll('[data-printable]')
    
    return Array.from(elements).map((el) => ({
      id: el.getAttribute('data-printable-id') || `section-${Math.random()}`,
      title: el.getAttribute('data-printable-title') || 'Untitled Section',
      element: el as HTMLElement,
      selected: true // Default to selected
    }))
  }

  /**
   * Apply print selections and trigger the browser print dialog
   */
  static async print(options: PrintOptions) {
    // Apply visibility based on selections
    options.sections.forEach(section => {
      section.element.classList.toggle('print-hidden', !section.selected)
    })

    // Add print class to body
    document.body.classList.add('printing')

    // Small delay to ensure styles are applied
    await new Promise(resolve => setTimeout(resolve, 100))

    // Trigger browser print
    window.print()

    // Cleanup after print dialog closes
    // Note: We can't reliably detect when print dialog closes, so we clean up after a delay
    setTimeout(() => {
      document.body.classList.remove('printing')
      options.sections.forEach(section => {
        section.element.classList.remove('print-hidden')
      })
    }, 1000)
  }

  /**
   * Generate a preview URL (opens in new window/tab)
   */
  static openPreview(options: PrintOptions) {
    // Clone current document
    const clonedDoc = document.cloneNode(true) as Document
    
    // Apply selections to clone
    const clonedSections = clonedDoc.querySelectorAll('[data-printable]')
    options.sections.forEach((section, idx) => {
      const clonedEl = clonedSections[idx] as HTMLElement
      if (clonedEl && !section.selected) {
        clonedEl.style.display = 'none'
      }
    })

    // Open in new window
    const previewWindow = window.open('', '_blank')
    if (previewWindow) {
      previewWindow.document.write(clonedDoc.documentElement.outerHTML)
      previewWindow.document.close()
    }
  }
}