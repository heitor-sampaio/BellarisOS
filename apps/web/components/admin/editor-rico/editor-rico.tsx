'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Eye } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { DocumentoRenderizado } from '@/components/shared/documento-renderizado'
import { converterDocumentoDoEditor, type DocumentoDoEditor, type NoPM } from '@/lib/documentos/editor/converter'
import { interpolar } from '@/lib/documentos/arvore'
import { VARIAVEIS_DE_DOCUMENTO, variaveisDoTipo, ehOpcional, type TipoDeModelo } from '@/lib/documentos/variaveis'
import { extensoesDoDocumento } from './extensoes'
import { BarraDoEditor, type Parte } from './barra'

/**
 * O editor rico de termos e contratos: corpo, cabeçalho e rodapé, cada um um
 * editor Tiptap (todos montados — trocar de aba não perde o desfazer), a
 * barra de formatação e a prévia com dados de exemplo.
 *
 * A folha tem as medidas do documento (em pontos, como o PDF): o que se
 * escreve aqui já tem o tamanho de letra e as margens do que vai ser assinado.
 * Carregado sob demanda (`next/dynamic`): o Tiptap só vem para quem edita.
 */

const CATALOGO = VARIAVEIS_DE_DOCUMENTO as Record<string, { grupo: string; rotulo: string; exemplo: string }>
const rotuloDaVariavel = (nome: string) => (CATALOGO[nome] ? `${CATALOGO[nome].grupo} · ${CATALOGO[nome].rotulo}` : nome)

const VAZIO: NoPM = { type: 'doc', content: [{ type: 'paragraph' }] }

function useParte(
  qual: Parte,
  inicial: NoPM | null | undefined,
  urls: () => Record<string, string>,
  aoMudar: (qual: Parte, json: NoPM) => void,
) {
  return useEditor({
    extensions: extensoesDoDocumento({ rotuloDaVariavel, urlsDasImagens: urls }),
    content: (inicial ?? VAZIO) as object,
    immediatelyRender: false,
    editorProps: { attributes: { class: 'editor-rico', spellcheck: 'true', 'aria-label': ROTULO_DA_PARTE[qual] } },
    onUpdate: ({ editor }) => aoMudar(qual, editor.getJSON() as NoPM),
  })
}

const ROTULO_DA_PARTE: Record<Parte, string> = { corpo: 'Corpo do documento', cabecalho: 'Cabeçalho do documento', rodape: 'Rodapé do documento' }

export default function EditorRico({ inicial, tipo, imagens, onChange }: {
  inicial:  DocumentoDoEditor
  tipo:     TipoDeModelo
  imagens:  Record<string, string>
  onChange: (doc: DocumentoDoEditor) => void
}) {
  const [parte, setParte] = useState<Parte>('corpo')
  const [urls, setUrls] = useState<Record<string, string>>(() => ({ ...imagens }))
  // O nó de imagem lê as URLs por esta função; o espelho é atualizado junto
  // com o estado, no próprio evento (a imagem é inserida logo em seguida).
  const espelhoDasUrls = useRef<Record<string, string>>(urls)
  const lerUrls = useCallback(() => espelhoDasUrls.current, [])

  // O último JSON de cada parte — escrito só nos callbacks do editor.
  const atual = useRef<DocumentoDoEditor>({
    corpo: inicial.corpo, cabecalho: inicial.cabecalho ?? null, rodape: inicial.rodape ?? null,
  })
  const mudou = useCallback((qual: Parte, json: NoPM) => {
    atual.current = { ...atual.current, [qual]: json }
    onChange(atual.current)
  }, [onChange])

  const editores = {
    corpo:     useParte('corpo', inicial.corpo, lerUrls, mudou),
    cabecalho: useParte('cabecalho', inicial.cabecalho, lerUrls, mudou),
    rodape:    useParte('rodape', inicial.rodape, lerUrls, mudou),
  }
  const ativo = editores[parte]

  const grupos = useMemo(() => {
    const porGrupo = new Map<string, { nome: string; rotulo: string }[]>()
    for (const { nome, variavel } of variaveisDoTipo(tipo)) {
      const lista = porGrupo.get(variavel.grupo) ?? []
      lista.push({ nome, rotulo: variavel.rotulo })
      porGrupo.set(variavel.grupo, lista)
    }
    return [...porGrupo]
  }, [tipo])

  // A prévia é o documento de verdade: conversor + interpolação com os
  // exemplos do catálogo, desenhado pelo mesmo componente da assinatura.
  const [previa, setPrevia] = useState<DocumentoDoEditor | null>(null)
  const resultado = useMemo(() => {
    if (!previa) return null
    const r = converterDocumentoDoEditor(previa, { tenantId: null })
    if ('erro' in r) return { erro: r.erro }
    return { documento: interpolar(r.documento, v => CATALOGO[v]?.exemplo ?? null, ehOpcional).documento }
  }, [previa])

  function aoEnviarImagem(caminho: string, url: string | null) {
    if (!url) return
    espelhoDasUrls.current = { ...espelhoDasUrls.current, [caminho]: url }
    setUrls(espelhoDasUrls.current)
  }

  return (
    <div className="editor-rico-caixa">
      <div className="editor-rico-topo">
        <SegSelect
          ariaLabel="Parte do documento"
          options={[{ key: 'corpo', label: 'Corpo' }, { key: 'cabecalho', label: 'Cabeçalho' }, { key: 'rodape', label: 'Rodapé' }]}
          value={parte} onSelect={k => { setParte(k as Parte); setPrevia(null) }}
        />
        <button type="button" className="filtro-toggle" aria-pressed={!!previa}
          onClick={() => setPrevia(p => (p ? null : { ...atual.current }))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Eye size={14} /> Prévia com dados de exemplo
        </button>
      </div>

      {!previa && ativo && <BarraDoEditor editor={ativo} parte={parte} grupos={grupos} aoEnviarImagem={aoEnviarImagem} />}
      {!previa && parte !== 'corpo' && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          {parte === 'cabecalho'
            ? 'O cabeçalho se repete no topo de toda página do PDF — bom para o logo e o nome da clínica.'
            : 'O rodapé se repete no pé de toda página do PDF, acima do selo da assinatura.'}
        </p>
      )}

      <div className="editor-rico-folha-caixa" hidden={!!previa}>
        {(['corpo', 'cabecalho', 'rodape'] as const).map(p => (
          <div key={p} className="folha-documento" hidden={p !== parte} data-parte={p}>
            <div className="folha-documento-pagina">
              <EditorContent editor={editores[p]} />
            </div>
          </div>
        ))}
      </div>

      {resultado && (
        'erro' in resultado
          ? <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{resultado.erro}</p>
          : <div className="editor-rico-folha-caixa" data-previa><DocumentoRenderizado documento={resultado.documento} imagens={urls} /></div>
      )}
    </div>
  )
}
