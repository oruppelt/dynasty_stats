/**
 * Draws a DOM element into a one-page PDF (the page as tall as the element, so nothing is cut
 * mid-row), then shares it (phones: the share sheet, straight into a chat) or downloads it.
 * The libraries load on first use, keeping them out of the page's bundle.
 */
export async function savePdf(node: HTMLElement, filename: string, title: string) {
  // Wait for the logos (not img.decode(): Chrome can leave it pending for an image off screen)
  await Promise.all([...node.querySelectorAll('img')].map(img => img.complete ? null : new Promise(done => {
    img.addEventListener('load', done, { once: true })
    img.addEventListener('error', done, { once: true })
  })))
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])

  const width = node.offsetWidth
  const height = node.offsetHeight
  const png = await toPng(node, { pixelRatio: 2, width, height, backgroundColor: '#ffffff' })
  // In points (3/4 of a CSS pixel): 800px wide is about an A4 page's width
  const [w, h] = [width * 0.75, height * 0.75]
  const pdf = new jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait' })
  pdf.addImage(png, 'PNG', 0, 0, w, h, undefined, 'FAST')
  pdf.setProperties({ title })
  const file = new File([pdf.output('blob')], filename, { type: 'application/pdf' })

  const touch = window.matchMedia('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e  // closing the share sheet isn't a failure
    }
    return
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
