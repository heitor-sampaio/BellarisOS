'use client'

import { useMemo, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { ArrowLeft, FileUp, FileText, ExternalLink } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { marcacaoParaEditor } from '@/lib/documentos/editor/da-marcacao'
import type { DocumentoDoEditor } from '@/lib/documentos/editor/converter'
import { ROTULO_DO_TIPO, validarDocumentoDoEditor, type TipoDeModelo } from '@/lib/documentos/variaveis'
import { salvarModeloDoEditor, salvarModeloDeArquivo, linkDoArquivoDoModelo } from '@/actions/modelos-de-documento'

/**
 * O editor de um modelo de termo ou contrato.
 *
 * Um editor de texto de verdade (`editor-rico/`: fonte, tamanho, negrito,
 * tabelas, imagens, cabeçalho e rodapé, variáveis), numa folha com as medidas
 * do documento assinado. Ou um PDF enviado, que vai como está.
 *
 * O tipo e a origem só se escolhem ao criar: mudá-los depois mudaria o sentido
 * do que já foi emitido (o banco também recusa). Modelo antigo, escrito na
 * marcação leve, abre convertido — salvar abre uma versão nova no formato novo.
 */

// O Tiptap só carrega para quem edita.
const EditorRico = dynamic(() => import('./editor-rico/editor-rico'), {
  ssr: false,
  loading: () => <div className="card" style={{ padding: 24, color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>Carregando o editor…</div>,
})

export interface ModeloEmEdicao {
  id:        string
  nome:      string
  tipo:      TipoDeModelo
  origem:    'EDITOR' | 'ARQUIVO'
  momento:   'AGENDAMENTO' | 'INICIO_ATENDIMENTO' | null
  exigencia: 'BLOQUEIA' | 'AVISA'
  versao:    number
  versaoId:  string | null
  /** A marcação leve das versões antigas. */
  texto:     string | null
  /** O JSON do editor rico. */
  documento: unknown | null
  arquivo:   { nome: string | null; tamanho: number | null; paginas: number | null } | null
}

const TEXTO_INICIAL: Record<TipoDeModelo, string> = {
  TERMO: [
    '# Termo de consentimento — {{procedimento.nome}}',
    '',
    'Eu, **{{cliente.nome}}**, CPF {{cliente.cpf}}, declaro que fui informada(o) sobre o procedimento **{{procedimento.nome}}**, seus benefícios, riscos e cuidados, e autorizo a sua realização na {{unidade.nome}}.',
    '',
    '## Declaro que',
    '- recebi as orientações de pré e pós-procedimento;',
    '- informei todas as minhas condições de saúde e medicações em uso;',
    '- tive a oportunidade de tirar todas as minhas dúvidas.',
    '',
    '{{unidade.cidade}}, {{data.hoje}}.',
    '',
    '[[assinatura]]',
  ].join('\n'),
  CONTRATO: [
    '# Contrato de prestação de serviços',
    '',
    '**Contratante:** {{cliente.nome}}, CPF {{cliente.cpf}}, residente em {{cliente.endereco}}, {{cliente.cidade}}/{{cliente.uf}}.',
    '**Contratada:** {{rede.nome}}, inscrita sob o nº {{rede.documento}}.',
    '',
    '## Objeto',
    'Realização de **{{procedimento.nome}}** em {{agendamento.data}}, às {{agendamento.hora}}, com {{profissional.nome}}, na {{unidade.nome}}, pelo valor de **{{procedimento.valor}}**.',
    '',
    '{{unidade.cidade}}, {{data.hoje}}.',
    '',
    '[[assinatura]]',
  ].join('\n'),
  CONTRATO_PLANO: [
    '# Contrato de prestação de serviços',
    '',
    '**Contratante:** {{cliente.nome}}, CPF {{cliente.cpf}}, residente em {{cliente.endereco}}, {{cliente.cidade}}/{{cliente.uf}}.',
    '**Contratada:** {{rede.nome}}, inscrita sob o nº {{rede.documento}}, unidade {{unidade.nome}}.',
    '',
    '## Objeto',
    'Plano de tratamento com {{plano.sessoes}} sessões:',
    '{{procedimentos.lista}}',
    '',
    '## Valor e pagamento',
    'Valor total: **{{plano.total}}**.',
    'Forma de pagamento: **{{pagamento.forma}}**.',
    '',
    '{{unidade.cidade}}, {{data.hoje}}.',
    '',
    '[[assinatura]]',
  ].join('\n'),
}

export function EditorDeDocumento({ existente, tipoInicial, origemInicial, imagens, onPronto, onVoltar }: {
  existente:      ModeloEmEdicao | null
  tipoInicial:    TipoDeModelo
  origemInicial:  'EDITOR' | 'ARQUIVO'
  /** URLs temporárias das imagens dos modelos (o editor mostra, não guarda). */
  imagens:        Record<string, string>
  onPronto:       () => void
  onVoltar:       () => void
}) {
  const [tipo, setTipo]           = useState<TipoDeModelo>(existente?.tipo ?? tipoInicial)
  const [origem, setOrigem]       = useState<'EDITOR' | 'ARQUIVO'>(existente?.origem ?? origemInicial)
  const [nome, setNome]           = useState(existente?.nome ?? '')
  const [momento, setMomento]     = useState<'AGENDAMENTO' | 'INICIO_ATENDIMENTO'>(existente?.momento ?? 'AGENDAMENTO')
  const [exigencia, setExigencia] = useState<'BLOQUEIA' | 'AVISA'>(existente?.exigencia ?? 'BLOQUEIA')
  const [inicial, setInicial]     = useState<DocumentoDoEditor>(() => documentoInicial(existente, existente?.tipo ?? tipoInicial))
  const [documento, setDocumento] = useState<DocumentoDoEditor>(inicial)
  // Trocar o tipo antes de escrever troca o texto de exemplo: o editor remonta.
  const [chave, setChave]         = useState(0)
  const [alterado, setAlterado]   = useState(false)
  const [arquivo, setArquivo]     = useState<File | null>(null)
  const [erro, setErro]           = useState<string | null>(null)
  const [salvando, iniciar]       = useTransition()
  const criando = !existente

  function trocarTipo(t: TipoDeModelo) {
    if (!alterado && criando) {
      const novo = documentoInicial(null, t)
      setInicial(novo); setDocumento(novo); setChave(k => k + 1)
    }
    setTipo(t)
  }

  // A mesma conferência do servidor, na hora: o botão de salvar diz o que falta.
  const validacao = useMemo(() => (origem === 'EDITOR' ? validarDocumentoDoEditor(documento, tipo, null) : null), [origem, documento, tipo])

  function salvar() {
    setErro(null)
    iniciar(async () => {
      const config = {
        id: existente?.id ?? null, nome, tipo,
        momento: tipo === 'CONTRATO_PLANO' ? null : momento,
        exigencia,
      }
      let r: { error?: string }
      if (origem === 'EDITOR') {
        // Cópia em JSON puro: o ProseMirror cria os `attrs` sem protótipo, e o
        // React mandaria esses objetos à action como referência temporária
        // (o servidor não consegue ler nenhum campo deles).
        r = await salvarModeloDoEditor({ ...config, documento: JSON.parse(JSON.stringify(documento)) as DocumentoDoEditor })
      } else {
        const fd = new FormData()
        if (config.id) fd.set('id', config.id)
        fd.set('nome', nome); fd.set('tipo', tipo); fd.set('exigencia', exigencia)
        if (config.momento) fd.set('momento', config.momento)
        if (arquivo) fd.set('arquivo', arquivo)
        r = await salvarModeloDeArquivo(fd)
      }
      if (r.error) { setErro(r.error); return }
      onPronto()
    })
  }

  async function abrirArquivoAtual() {
    if (!existente?.versaoId) return
    const r = await linkDoArquivoDoModelo(existente.versaoId)
    if (r.url) window.open(r.url, '_blank', 'noopener')
    else setErro(r.error ?? 'Não consegui abrir o arquivo.')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" className="btn-ghost" onClick={onVoltar} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          {criando ? 'Novo modelo' : `${nome || 'Modelo'} · versão ${existente.versao}`}
        </h2>
      </div>

      <div className="form-2col">
        <div style={{ gridColumn: '1 / -1' }}>
          <Campo rotulo="Nome do modelo">
            <input className="field" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Termo de consentimento — toxina botulínica" maxLength={120} />
          </Campo>
        </div>

        {criando && (
          <>
            <Campo rotulo="Tipo" dica={DICA_DO_TIPO[tipo]}>
              <SegSelect
                ariaLabel="Tipo do modelo"
                options={(['TERMO', 'CONTRATO', 'CONTRATO_PLANO'] as const).map(k => ({ key: k, label: ROTULO_CURTO[k] }))}
                value={tipo} onSelect={k => trocarTipo(k as TipoDeModelo)}
              />
            </Campo>
            <Campo rotulo="Conteúdo" dica={origem === 'EDITOR' ? 'Escrito aqui, com os dados do cliente preenchidos na hora.' : 'Um PDF pronto da clínica, assinado como está — sem preencher dados.'}>
              <SegSelect
                ariaLabel="Origem do conteúdo"
                options={[{ key: 'EDITOR', label: 'Escrever aqui' }, { key: 'ARQUIVO', label: 'Enviar PDF' }]}
                value={origem} onSelect={k => setOrigem(k as 'EDITOR' | 'ARQUIVO')}
              />
            </Campo>
          </>
        )}

        {tipo !== 'CONTRATO_PLANO' && (
          <Campo rotulo="Quando nasce (atendimento avulso)" dica="No plano de tratamento, o termo é assinado no fechamento do plano.">
            <SegSelect
              ariaLabel="Quando o documento nasce"
              options={[{ key: 'AGENDAMENTO', label: 'Ao agendar' }, { key: 'INICIO_ATENDIMENTO', label: 'No início do atendimento' }]}
              value={momento} onSelect={k => setMomento(k as 'AGENDAMENTO' | 'INICIO_ATENDIMENTO')}
            />
          </Campo>
        )}
        <Campo rotulo="Sem assinatura" dica={exigencia === 'BLOQUEIA'
          ? (tipo === 'CONTRATO_PLANO' ? 'O plano não é fechado sem o contrato assinado.' : 'O atendimento não é iniciado sem o documento assinado.')
          : 'A equipe é avisada, mas nada é travado.'}>
          <SegSelect
            ariaLabel="O que acontece sem assinatura"
            options={[{ key: 'BLOQUEIA', label: 'Bloqueia' }, { key: 'AVISA', label: 'Só avisa' }]}
            value={exigencia} onSelect={k => setExigencia(k as 'BLOQUEIA' | 'AVISA')}
          />
        </Campo>
      </div>

      {origem === 'EDITOR' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <EditorRico key={chave} inicial={inicial} tipo={tipo} imagens={imagens}
            onChange={d => { setDocumento(d); setAlterado(true) }} />
          {validacao?.erro && <p role="status" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{validacao.erro}</p>}
        </div>
      ) : (
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {existente?.arquivo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <FileText size={18} color="var(--brand)" />
              <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>{existente.arquivo.nome ?? 'documento.pdf'}</span>
              <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
                {existente.arquivo.paginas} página{existente.arquivo.paginas === 1 ? '' : 's'}
              </span>
              <button type="button" className="btn-ghost" onClick={abrirArquivoAtual} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <ExternalLink size={13} /> Abrir
              </button>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <span className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FileUp size={14} /> {existente?.arquivo ? 'Trocar o PDF' : 'Escolher o PDF'}
            </span>
            <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>{arquivo ? arquivo.name : 'Até 10 MB e 50 páginas, sem senha.'}</span>
            <input type="file" accept="application/pdf,.pdf" hidden aria-label="Arquivo PDF do modelo"
              onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
          </label>
          {existente?.arquivo && arquivo && (
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
              Trocar o arquivo abre a versão {existente.versao + 1}. Quem já assinou continua com a versão que assinou.
            </p>
          )}
        </div>
      )}

      {!criando && origem === 'EDITOR' && (alterado || !existente.documento) && (
        <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
          Salvar abre a versão {existente.versao + 1}. Quem já assinou continua com a versão que assinou.
        </p>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-ghost" onClick={onVoltar} disabled={salvando}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={salvar}
          disabled={salvando || (origem === 'EDITOR' && !!validacao?.erro) || (origem === 'ARQUIVO' && criando && !arquivo)}>
          {salvando ? 'Salvando…' : 'Salvar modelo'}
        </button>
      </div>
    </div>
  )
}

const ROTULO_CURTO: Record<TipoDeModelo, string> = {
  TERMO: 'Termo', CONTRATO: 'Contrato do procedimento', CONTRATO_PLANO: 'Contrato de plano',
}

const DICA_DO_TIPO: Record<TipoDeModelo, string> = {
  TERMO:          `${ROTULO_DO_TIPO.TERMO}: ligado ao procedimento, assinado no atendimento e no fechamento do plano.`,
  CONTRATO:       'Ligado ao procedimento, assinado no atendimento avulso.',
  CONTRATO_PLANO: 'O contrato de todo plano de tratamento da rede — um só ativo.',
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{rotulo}</span>
      {children}
      {dica && <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>{dica}</p>}
    </div>
  )
}

/** O que o editor abre: o JSON salvo, a marcação antiga convertida, ou o exemplo do tipo. */
function documentoInicial(existente: ModeloEmEdicao | null, tipo: TipoDeModelo): DocumentoDoEditor {
  if (existente?.documento) return existente.documento as DocumentoDoEditor
  return marcacaoParaEditor(existente?.texto ?? TEXTO_INICIAL[tipo])
}
