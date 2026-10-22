// Shareable state in the address bar (?team=..., ?period=...). The page is a
// static export, so these are read in the browser after it loads.

export function getUrlParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  return new URL(window.location.href).searchParams.get(name)
}

/** Sets or (with an empty value) removes a parameter, without a new history entry. */
export function setUrlParam(name: string, value: string) {
  const url = new URL(window.location.href)
  if (value) url.searchParams.set(name, value)
  else url.searchParams.delete(name)
  window.history.replaceState(null, '', url)
}
