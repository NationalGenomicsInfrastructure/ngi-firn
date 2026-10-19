export function scannerState(document: Document) {
  const tabList = document.querySelector('[role="tablist"]')
  const root = tabList?.parentElement
  const active = tabList?.querySelector('[role="tab"][data-state="active"]')
  const infoActive = active?.textContent?.trim() === 'Info'
  // Reka adds trigger aria-controls only after hydration; panel state exists in SSR.
  const info = root?.querySelector(':scope > [role="tabpanel"][data-state="active"]')
  const reader = info?.querySelector('[role="tab"][data-state="active"]')
  const readerActive = reader?.textContent?.trim() === 'Scanner or keyboard'
  const cameraActive = reader?.textContent?.trim() === 'Device camera'
  const readerRoot = reader?.closest('[role="tablist"]')?.parentElement
  const readerPanel = readerRoot?.querySelector(':scope > [role="tabpanel"][data-state="active"]')
  const input = readerPanel?.querySelector<HTMLInputElement>('input[placeholder="Scan one barcode"]')
  return {
    heading: Array.from(document.querySelectorAll('h4')).some(h => h.textContent?.includes('Barcode-Scanner')),
    panels: root?.querySelectorAll(':scope > [role="tabpanel"]:not([hidden])').length ?? 0,
    interactive: Boolean(active?.hasAttribute('aria-controls')),
    readerReady: !infoActive || cameraActive || Boolean(readerActive && input && !input.disabled && !input.readOnly && !input.closest('[hidden]'))
  }
}

export function excludedControl(element: Element, currentUrl: string) {
  const label = `${element.textContent} ${element.getAttribute('aria-label')}`
  if (/logout/i.test(label)) return true
  if (element.getAttribute('role') !== 'tab' && element.querySelector('.i-lucide-camera')) return true
  const href = element.getAttribute('href')
  if (!href) return false
  const url = new URL(href, currentUrl)
  return url.origin !== new URL(currentUrl).origin || url.pathname !== '/scan'
}
