'use client'

import { useState } from 'react'
import { FileSearch } from 'lucide-react'

/**
 * "Este arquivo é o documento assinado?" — o SHA-256 é calculado AQUI, no
 * navegador: o arquivo não sai da máquina de quem confere. Só os hashes vêm
 * do servidor.
 */
export function ConferirArquivo({ pdfAssinado, conteudo }: { pdfAssinado: string | null; conteudo: string | null }) {
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  async function conferir(arquivo: File | undefined) {
    if (!arquivo) return
    const d = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer())
    const hash = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('')
    if (pdfAssinado && hash === pdfAssinado) setResultado({ ok: true, texto: 'Este arquivo é o PDF assinado, sem nenhuma alteração.' })
    else if (conteudo && hash === conteudo) setResultado({ ok: true, texto: 'Este arquivo é o documento original que foi assinado (sem a página de assinatura).' })
    else setResultado({ ok: false, texto: 'Este arquivo NÃO confere com o documento deste código: ele foi alterado ou é outro documento.' })
  }

  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', display: 'flex', gap: 8, alignItems: 'center' }}>
        <FileSearch size={16} color="var(--brand)" /> Conferir um arquivo
      </p>
      <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
        Escolha o PDF que você recebeu. A conferência acontece no seu aparelho — o arquivo não é enviado.
      </p>
      <label className="btn-secondary" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
        Escolher arquivo
        <input type="file" hidden aria-label="Arquivo para conferir" onChange={e => conferir(e.target.files?.[0])} />
      </label>
      {resultado && (
        <p role="status" style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-semibold)', color: resultado.ok ? 'var(--success)' : 'var(--danger)' }}>
          {resultado.texto}
        </p>
      )}
    </div>
  )
}
