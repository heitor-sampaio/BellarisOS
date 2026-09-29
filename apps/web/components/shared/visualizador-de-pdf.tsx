'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Desenha um PDF em canvas, página a página, com o pdf.js.
 *
 * Existe porque o WebView do Android (o app é o portal num Capacitor) não
 * mostra PDF em `<iframe>`: o termo enviado pela clínica ficaria em branco
 * justamente no tablet da recepção. Recebe os BYTES, e não a URL — quem chama
 * já os baixou para calcular o hash do que está sendo mostrado.
 */
export function VisualizadorDePdf({ bytes }: { bytes: ArrayBuffer }) {
  const ref = useRef<HTMLDivElement>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    let worker: Worker | null = null
    const alvo = ref.current
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        worker = new Worker(new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url), { type: 'module' })
        pdfjs.GlobalWorkerOptions.workerPort = worker
        // Cópia: o pdf.js transfere o buffer para o worker, e o original
        // (que o hash usou) ficaria vazio.
        const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise
        if (cancelado || !alvo) return
        alvo.replaceChildren()
        const largura = alvo.clientWidth || 700
        for (let n = 1; n <= pdf.numPages; n++) {
          const pagina = await pdf.getPage(n)
          if (cancelado) return
          const base = pagina.getViewport({ scale: 1 })
          const escala = (largura / base.width) * (window.devicePixelRatio || 1)
          const vista = pagina.getViewport({ scale: escala })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(vista.width)
          canvas.height = Math.floor(vista.height)
          canvas.style.width = '100%'
          canvas.style.display = 'block'
          canvas.style.border = '1px solid var(--border)'
          canvas.style.borderRadius = 'var(--radius-field-token)'
          canvas.setAttribute('aria-label', `Página ${n} de ${pdf.numPages}`)
          alvo.appendChild(canvas)
          await pagina.render({ canvas, viewport: vista }).promise
        }
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Não consegui abrir o PDF.')
      }
    })()
    return () => { cancelado = true; worker?.terminate() }
  }, [bytes])

  if (erro) {
    return <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>Não consegui mostrar o PDF: {erro}</p>
  }
  return <div ref={ref} data-pdf style={{ display: 'flex', flexDirection: 'column', gap: 12 }} />
}
