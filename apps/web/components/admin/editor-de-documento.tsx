'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { ArrowLeft, FileUp, FileText, ExternalLink } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { DocumentoRenderizado } from '@/components/shared/documento-renderizado'
import { analisarMarcacao, interpolarArvore } from '@/lib/documentos/marcacao'
import { deV1 } from '@/lib/documentos/arvore'
import {
  ROTULO_DO_TIPO, VARIAVEIS_DE_DOCUMENTO, variaveisDoTipo, validarModelo, ehOpcional,
  type TipoDeModelo, type NomeDeVariavel,
} from '@/lib/documentos/variaveis'
import { salvarModeloDoEditor, salvarModeloDeArquivo, linkDoArquivoDoModelo } from '@/actions/modelos-de-documento'

/**
 * O editor de um modelo de termo ou contrato.
 *
 * Texto com marcação leve (`lib/documentos/marcacao.ts`) e variáveis do
 * catálogo fechado, com a prévia ao lado desenhada pela MESMA árvore que o
 * documento emitido usa. Ou um PDF enviado, que vai como está.
 *
 * O tipo e a origem só se escolhem ao criar: mudá-los depois mudaria o sentido
 * do que já foi emitido (o banco também recusa).
 */

export interface ModeloEmEdicao {
  id:        string
  nome:      string
  tipo:      TipoDeModelo
  origem:    'EDITOR' | 'ARQUIVO'
  momento:   'AGENDAMENTO' | 'INICIO_ATENDIMENTO' | null
  exigencia: 'BLOQUEIA' | 'AVISA'
  versao:    number
  versaoId:  string | null
  texto:     string | null
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

export function EditorDeDocumento({ existente, tipoInicial, origemInicial, onPronto, onVoltar }: {
  existente:      ModeloEmEdicao | null
  tipoInicial:    TipoDeModelo
  origemInicial:  'EDITOR' | 'ARQUIVO'
  onPronto:       () => void
  onVoltar:       () => void
}) {
  const [tipo, setTipo]           = useState<TipoDeModelo>(existente?.tipo ?? tipoInicial)
  const [origem, setOrigem]       = useState<'EDITOR' | 'ARQUIVO'>(existente?.origem ?? origemInicial)
  const [nome, setNome]           = useState(existente?.nome ?? '')
  const [momento, setMomento]     = useState<'AGENDAMENTO' | 'INICIO_ATENDIMENTO'>(existente?.momento ?? 'AGENDAMENTO')
  const [exigencia, setExigencia] = useState<'BLOQUEIA' | 'AVISA'>(existente?.exigencia ?? 'BLOQUEIA')
  const [texto, setTexto]         = useState(existente?.texto ?? TEXTO_INICIAL[existente?.tipo ?? tipoInicial])
  const [arquivo, setArquivo]     = useState<File | null>(null)
  const [erro, setErro]           = useState<string | null>(null)
  const [salvando, iniciar]       = useTransition()
  const textoRef = useRef<HTMLTextAreaElement>(null)
  const criando = !existente

  // O texto de exemplo acompanha o tipo enquanto a pessoa ainda não escreveu.
  function trocarTipo(t: TipoDeModelo) {
    if (texto === TEXTO_INICIAL[tipo]) setTexto(TEXTO_INICIAL[t])
    setTipo(t)
  }

  const validacao = useMemo(() => (origem === 'EDITOR' ? validarModelo(texto, tipo) : null), [origem, texto, tipo])

  const previa = useMemo(() => {
    if (origem !== 'EDITOR') return null
    const exemplo = (v: string) =>
      (VARIAVEIS_DE_DOCUMENTO as Record<string, { exemplo: string }>)[v]?.exemplo ?? `{{${v}}}`
    return interpolarArvore(analisarMarcacao(texto), exemplo, ehOpcional).arvore
  }, [origem, texto])

  const grupos = useMemo(() => {
    const porGrupo = new Map<string, { nome: string; rotulo: string }[]>()
    for (const { nome: n, variavel } of variaveisDoTipo(tipo)) {
      const lista = porGrupo.get(variavel.grupo) ?? []
      lista.push({ nome: n, rotulo: variavel.rotulo })
      porGrupo.set(variavel.grupo, lista)
    }
    return [...porGrupo]
  }, [tipo])

  /** Escreve a variável onde está o cursor, sem roubar a seleção de quem digita. */
  function inserir(variavel: NomeDeVariavel | string) {
    const el = textoRef.current
    const marca = `{{${variavel}}}`
    if (!el) { setTexto(t => t + marca); return }
    const ini = el.selectionStart, fim = el.selectionEnd
    const novo = texto.slice(0, ini) + marca + texto.slice(fim)
    setTexto(novo)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(ini + marca.length, ini + marca.length)
    })
  }

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
        r = await salvarModeloDoEditor({ ...config, texto })
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
        <div className="editor-documento">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span className="overline">Texto</span>
              <select
                className="filtro-select" value="" aria-label="Inserir variável"
                onChange={e => { if (e.target.value) inserir(e.target.value) }}
              >
                <option value="">Inserir variável…</option>
                {grupos.map(([grupo, vs]) => (
                  <optgroup key={grupo} label={grupo}>
                    {vs.map(v => <option key={v.nome} value={v.nome}>{v.rotulo}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <textarea
              ref={textoRef} className="field" value={texto} onChange={e => setTexto(e.target.value)}
              rows={22} spellCheck
              style={{ resize: 'vertical', fontSize: 'var(--text-sm-sz)', lineHeight: 1.55 }}
            />
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
              <code># Título</code> · <code>## Subtítulo</code> · <code>**negrito**</code> · <code>- item</code> · <code>1. item</code> · <code>---</code> divisória · <code>[[assinatura]]</code> onde o cliente assina (sem ela, no fim).
            </p>
            {validacao?.erro && <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{validacao.erro}</p>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <span className="overline">Prévia com dados de exemplo</span>
            <div className="card" style={{ padding: '24px 22px', background: 'var(--surface)' }}>
              {previa && <DocumentoRenderizado documento={deV1(previa)} />}
            </div>
          </div>
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

      {!criando && origem === 'EDITOR' && texto !== existente.texto && (
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
