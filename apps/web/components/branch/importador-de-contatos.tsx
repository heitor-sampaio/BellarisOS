'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileUp, Download, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { SegSelect } from '@/components/shared/seg-select'
import { StageOptions } from './stage-options'
import { decodificar, lerCsv } from '@/lib/importacao/csv'
import { camposDoDestino, sugerirMapeamento, colunasQueFaltam, type ChaveDeCampo, type Destino } from '@/lib/importacao/campos'
import { validarLinha, marcarRepetidas, type LinhaValidada, type Referencias } from '@/lib/importacao/normalizar'
import { importarContatos, andamentoDaImportacao, type AndamentoDaImportacao } from '@/actions/importacao'

/**
 * Importar contatos de um CSV (2026-10-13): arquivo → colunas → prévia →
 * importação em segundo plano. O arquivo é lido AQUI (a prévia sai na hora,
 * nada vai ao servidor antes de confirmar); o servidor valida tudo de novo.
 */

const MAX_BYTES = 5 * 1024 * 1024
const MAX_LINHAS = 10_000

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

const DESTINOS: Record<Destino, { rotulo: string; explica: string }> = {
  clientes: {
    rotulo: 'Como clientes',
    explica: 'Cada linha vira a FICHA de cliente na unidade escolhida — com CPF, endereço e conta de fidelidade. Para migrar a base de outro sistema. Não cria acesso ao portal (isso se faz na ficha).',
  },
  contatos: {
    rotulo: 'Como contatos do CRM',
    explica: 'Cada linha vira só a PESSOA no CRM (nome, telefone, e-mail, rede social, tags), sem ficha clínica — para uma lista de leads. Ela vira cliente depois, quando for atendida.',
  },
}

interface Props {
  podeClientes: boolean
  podeContatos: boolean
  podeOportunidade: boolean
  unidades: { id: string; nome: string }[]
  unidadeFixa: boolean
  funis: { id: string; name: string }[]
  etapas: { id: string; funnel_id: string; name: string }[]
  /** A primeira etapa do funil padrão. */
  etapaPadrao: string
  /** Quem pode ser responsável (null: só quem importa — e sem a coluna de responsável). */
  responsaveis: { id: string; name: string; email: string | null }[] | null
  /** Os procedimentos ativos (a coluna "procedimento de interesse" cita pelo nome). */
  procedimentos: { id: string; name: string }[]
  eu: string | null
}

function Aviso({ tom, children }: { tom: 'erro' | 'ok' | 'espera'; children: React.ReactNode }) {
  const t = {
    erro:   { bg: 'var(--danger-soft)', cor: 'var(--danger)' },
    ok:     { bg: 'var(--success-soft)', cor: 'var(--success)' },
    espera: { bg: 'var(--warning-soft)', cor: 'var(--warning)' },
  }[tom]
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px', borderRadius: 'var(--radius-field-token)', background: t.bg, color: t.cor, fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>
      {tom === 'ok' ? <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: 2 }} /> : <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

const rotuloCampo: React.CSSProperties = { fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }

export function ImportadorDeContatos(p: Props) {
  const destinosPossiveis = (['clientes', 'contatos'] as Destino[]).filter(d => d === 'clientes' ? p.podeClientes : p.podeContatos)
  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1)
  const [arquivo, setArquivo] = useState<{ nome: string; cabecalho: string[]; linhas: string[][]; numeros: number[]; separador: string } | null>(null)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  const [destino, setDestino] = useState<Destino>(destinosPossiveis[0] ?? 'clientes')
  const [branchId, setBranchId] = useState(p.unidades.length === 1 ? p.unidades[0]!.id : '')
  const [mapa, setMapa] = useState<(ChaveDeCampo | null)[]>([])
  const [comOportunidade, setComOportunidade] = useState(false)
  const [etapaId, setEtapaId] = useState(p.etapaPadrao)
  const [responsavelId, setResponsavelId] = useState(p.eu ?? '')
  const [importacaoId, setImportacaoId] = useState<string | null>(null)
  const [andamento, setAndamento] = useState<AndamentoDaImportacao | null>(null)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function lerArquivo(f: File | undefined) {
    setErroArquivo(null); setArquivo(null)
    if (!f) return
    if (f.size > MAX_BYTES) { setErroArquivo('O arquivo passa de 5 MB. Divida a planilha em partes.'); return }
    const lido = lerCsv(decodificar(new Uint8Array(await f.arrayBuffer())))
    if (!lido.cabecalho.length || !lido.linhas.length) { setErroArquivo('Não achei linhas neste arquivo. A primeira linha deve ser o cabeçalho.'); return }
    if (lido.linhas.length > MAX_LINHAS) { setErroArquivo(`O arquivo tem ${lido.linhas.length.toLocaleString('pt-BR')} linhas; o máximo é ${MAX_LINHAS.toLocaleString('pt-BR')} por importação.`); return }
    setArquivo({ nome: f.name, ...lido })
  }

  // Os campos desta importação: os do card só com oportunidade; a unidade por
  // linha só na rede; a coluna de responsável só para quem escolhe responsável.
  const unidadePorLinha = destino === 'clientes' && !p.unidadeFixa
  const campos = useMemo(() => camposDoDestino(destino, { oportunidade: comOportunidade, unidadePorLinha })
    .filter(c => c.chave !== 'op_responsavel' || p.responsaveis), [destino, comOportunidade, unidadePorLinha, p.responsaveis])

  // As listas da rede com que a prévia resolve os nomes da planilha.
  const funilDaEtapa = p.etapas.find(e => e.id === etapaId)?.funnel_id
  const refs = useMemo<Referencias>(() => ({
    unidades: p.unidades,
    etapas: p.etapas.filter(e => e.funnel_id === funilDaEtapa).map(e => ({ id: e.id, nome: e.name })),
    membros: (p.responsaveis ?? []).map(r => ({ id: r.id, nome: r.name, email: r.email })),
    procedimentos: p.procedimentos.map(x => ({ id: x.id, nome: x.name })),
  }), [p.unidades, p.etapas, p.responsaveis, p.procedimentos, funilDaEtapa])

  function irParaColunas() {
    if (!arquivo) return
    const oferecidos = new Set(campos.map(c => c.chave))
    setMapa(sugerirMapeamento(arquivo.cabecalho, destino, { oportunidade: comOportunidade, unidadePorLinha })
      .map(c => (c && oferecidos.has(c) ? c : null)))
    setPasso(2)
  }

  function escolherCampo(i: number, campo: ChaveDeCampo | null) {
    // Cada campo vai para uma coluna só: escolher aqui tira da outra.
    setMapa(m => m.map((c, j) => (j === i ? campo : c === campo ? null : c)))
  }

  const faltando = colunasQueFaltam(destino, campos, mapa)

  const validadas = useMemo<LinhaValidada[]>(() => {
    if (passo < 3 || !arquivo) return []
    // O número é o da PLANILHA (linha em branco e célula de várias linhas contam).
    return marcarRepetidas(destino, arquivo.linhas.map((l, i) => ({ numero: arquivo.numeros[i] ?? i + 2, ...validarLinha(destino, mapa, l, refs) })))
  }, [passo, arquivo, destino, mapa, refs])
  const prontas = validadas.filter(l => !l.erros.length).length
  const comErro = validadas.length - prontas

  function importar() {
    if (!arquivo) return
    setErroEnvio(null)
    startTransition(async () => {
      const r = await importarContatos({
        destino, branchId: destino === 'clientes' ? branchId : null, nomeArquivo: arquivo.nome,
        mapeamento: mapa, linhas: arquivo.linhas, numeros: arquivo.numeros,
        oportunidade: comOportunidade && etapaId ? { etapaId, responsavelId: responsavelId || null } : null,
      })
      if (!r.ok) { setErroEnvio(r.error); return }
      setImportacaoId(r.importacaoId)
      setAndamento(null)
      setPasso(4)
    })
  }

  // Acompanha a importação enquanto roda.
  const rodando = !andamento || andamento.status === 'pendente' || andamento.status === 'importando'
  useEffect(() => {
    if (!importacaoId || !rodando) return
    let vivo = true
    const ler = () => andamentoDaImportacao(importacaoId).then(a => {
      if (!vivo || !a) return
      setAndamento(a)
      // Terminou: a lista de clientes ao lado passa a mostrar quem entrou.
      if (a.status === 'concluida' || a.status === 'falhou') router.refresh()
    }).catch(() => {})
    void ler()
    const t = setInterval(ler, 2000)
    return () => { vivo = false; clearInterval(t) }
  }, [importacaoId, rodando, router])

  function recomecar() {
    setPasso(1); setArquivo(null); setImportacaoId(null); setAndamento(null); setComOportunidade(false); setErroEnvio(null)
  }

  const exemplo = (i: number) => arquivo?.linhas.find(l => (l[i] ?? '').trim())?.[i]?.trim() ?? ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      <div>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
          Importar contatos
        </h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 4 }}>
          De uma planilha em CSV, como clientes ou como contatos do CRM. Passo {passo} de 4 · {['Arquivo', 'Colunas', 'Prévia', 'Importação'][passo - 1]}
        </p>
      </div>

      {/* 1. Arquivo e destino */}
      {passo === 1 && (
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label htmlFor="importar-arquivo" style={rotuloCampo}>Arquivo CSV</label>
            <input id="importar-arquivo" type="file" accept=".csv,text/csv" className="field"
              onChange={e => void lerArquivo(e.target.files?.[0])} />
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: 0 }}>
              A primeira linha é o cabeçalho. Até 5 MB e 10 mil linhas. No Excel: Arquivo → Salvar como → CSV.
            </p>
            {arquivo && (
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', margin: 0 }}>
                <strong>{arquivo.nome}</strong> · {plural(arquivo.linhas.length, 'linha', 'linhas')}, {plural(arquivo.cabecalho.length, 'coluna', 'colunas')}
              </p>
            )}
            {erroArquivo && <Aviso tom="erro">{erroArquivo}</Aviso>}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={rotuloCampo}>Importar</span>
            {destinosPossiveis.length > 1 ? (
              <SegSelect
                options={destinosPossiveis.map(d => ({ key: d, label: DESTINOS[d].rotulo }))}
                value={destino} onSelect={k => setDestino(k as Destino)} ariaLabel="Para onde vão as linhas"
              />
            ) : (
              <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700 }}>{DESTINOS[destino].rotulo}</span>
            )}
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{DESTINOS[destino].explica}</p>
          </div>

          {destino === 'clientes' && (
            p.unidadeFixa ? (
              <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0 }}>
                Unidade: <strong style={{ color: 'var(--text)' }}>{p.unidades[0]?.nome}</strong>
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 }}>
                <label htmlFor="importar-unidade" style={rotuloCampo}>Unidade</label>
                <select id="importar-unidade" className="field" value={branchId} onChange={e => setBranchId(e.target.value)}>
                  <option value="" disabled>Escolha a unidade</option>
                  {p.unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
                {p.unidades.length > 1 && (
                  <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', margin: 0 }}>
                    Se a planilha tiver uma coluna de unidade, cada linha vai para a dela; esta vale para as linhas sem.
                  </p>
                )}
              </div>
            )
          )}

          {/* A oportunidade se decide ANTES das colunas: com ela, a planilha
              pode trazer os campos do card (origem, valor, etapa…). */}
          {p.podeOportunidade && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={comOportunidade} onChange={e => setComOportunidade(e.target.checked)} />
                Criar oportunidade no funil
              </label>
              {comOportunidade && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label htmlFor="importar-etapa" style={rotuloCampo}>Etapa</label>
                    <select id="importar-etapa" className="field" value={etapaId} onChange={e => setEtapaId(e.target.value)}>
                      <StageOptions funnels={p.funis} stages={p.etapas} />
                    </select>
                  </div>
                  {p.responsaveis && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label htmlFor="importar-responsavel" style={rotuloCampo}>Responsável</label>
                      <select id="importar-responsavel" className="field" value={responsavelId} onChange={e => setResponsavelId(e.target.value)}>
                        <option value="">Sem responsável</option>
                        {p.responsaveis.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  )}
                  <p style={{ gridColumn: '1 / -1', fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
                    A planilha também pode trazer, por linha, a origem, o valor, a etapa (deste funil), {p.responsaveis ? 'o responsável, ' : ''}o
                    procedimento de interesse e a campanha — a etapa{p.responsaveis ? ' e o responsável' : ''} daqui valem para as linhas sem.
                    Quem já tem oportunidade aberta neste funil não ganha outra.
                  </p>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-primary" onClick={irParaColunas}
              disabled={!arquivo || (destino === 'clientes' && !branchId) || (comOportunidade && !etapaId)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* 2. As colunas */}
      {passo === 2 && arquivo && (
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
            Diga para onde vai cada coluna. As sugestões vieram do cabeçalho — confira.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {arquivo.cabecalho.map((h, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 220px)', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h || `Coluna ${i + 1}`}</span>
                <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exemplo(i) || '—'}</span>
                <select aria-label={`Campo da coluna ${h || `Coluna ${i + 1}`}`} className="field"
                  value={mapa[i] ?? ''} onChange={e => escolherCampo(i, (e.target.value || null) as ChaveDeCampo | null)}>
                  <option value="">Não importar</option>
                  {(['pessoa', 'oportunidade'] as const).map(g => {
                    const doGrupo = campos.filter(c => c.grupo === g)
                    if (!doGrupo.length) return null
                    return (
                      <optgroup key={g} label={g === 'oportunidade' ? 'Oportunidade' : destino === 'clientes' ? 'Ficha do cliente' : 'Pessoa'}>
                        {doGrupo.map(c => <option key={c.chave} value={c.chave}>{c.rotulo}{c.obrigatorio ? ' *' : ''}</option>)}
                      </optgroup>
                    )
                  })}
                </select>
              </div>
            ))}
          </div>
          {faltando.length > 0 && (
            <Aviso tom="espera">Escolha a coluna de: {faltando.join(', ')}.</Aviso>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="btn-ghost" onClick={() => setPasso(1)}>Voltar</button>
            <button type="button" className="btn-primary" onClick={() => setPasso(3)} disabled={faltando.length > 0}>Continuar</button>
          </div>
        </div>
      )}

      {/* 3. A prévia */}
      {passo === 3 && arquivo && (
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div data-previa style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Aviso tom={prontas ? 'ok' : 'erro'}>
              {plural(prontas, 'linha pronta', 'linhas prontas')} para importar
              {comErro > 0 && <> · {plural(comErro, 'com erro', 'com erro')} (ficam de fora e vão para o relatório)</>}
            </Aviso>
            {comErro > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 220, overflowY: 'auto' }}>
                {validadas.filter(l => l.erros.length).slice(0, 30).map(l => (
                  <li key={l.numero}>Linha {l.numero}: {l.erros.join(' ')}</li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', margin: 0, lineHeight: 1.5 }}>
              Quem já está cadastrado ({destino === 'clientes' ? 'pelo CPF ou, sem CPF, pelo telefone' : 'pelo telefone ou, sem ele, pelo e-mail'}) só tem o que está em
              branco completado — nada do que a clínica já tem é trocado.{destino === 'contatos' && ' O mesmo telefone em duas linhas é a mesma pessoa: as tags e a origem se juntam.'} A importação não dispara as
              automações de cadastro (boas-vindas, novo lead); as de rotina — aniversário, quem não volta há
              tempo — passam a contar com quem entrou.
            </p>
          </div>

          {comOportunidade && (
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', margin: 0, borderTop: '1px solid var(--hairline)', paddingTop: 12 }}>
              Cria oportunidade em <strong style={{ color: 'var(--text)' }}>
                {p.funis.find(f => f.id === funilDaEtapa)?.name} · {p.etapas.find(e => e.id === etapaId)?.name}
              </strong>
              {p.responsaveis && <>, responsável <strong style={{ color: 'var(--text)' }}>
                {p.responsaveis.find(r => r.id === responsavelId)?.name ?? 'nenhum'}
              </strong></>}
              {mapa.includes('op_etapa') || mapa.includes('op_responsavel') ? ' (quando a linha não diz outra)' : ''}.
            </p>
          )}

          {erroEnvio && <Aviso tom="erro">{erroEnvio}</Aviso>}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="btn-ghost" onClick={() => setPasso(2)} disabled={isPending}>Voltar</button>
            <button type="button" className="btn-primary" onClick={importar} disabled={!prontas || isPending}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              Importar {plural(prontas, 'linha', 'linhas')}
            </button>
          </div>
        </div>
      )}

      {/* 4. A importação */}
      {passo === 4 && (
        <div data-importacao className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {(() => {
            const a = andamento
            const status = !a ? 'Aguardando' : a.status === 'concluida' ? 'Concluída' : a.status === 'falhou' ? 'Falhou' : a.status === 'importando' ? 'Em andamento' : 'Aguardando'
            const pct = a?.total ? Math.round((a.processadas / a.total) * 100) : 0
            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {rodando ? <Loader2 size={16} className="animate-spin" color="var(--brand)" /> : a?.status === 'concluida'
                    ? <CheckCircle2 size={16} color="var(--success)" /> : <AlertCircle size={16} color="var(--danger)" />}
                  <span style={{ fontSize: 'var(--text-base-sz)', fontWeight: 800, color: 'var(--text)' }}>{status}</span>
                  {a && <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>· {a.processadas} de {plural(a.total, 'linha', 'linhas')}</span>}
                </div>
                {rodando && (
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Importação: ${pct}%`}
                    style={{ height: 6, borderRadius: 99, background: 'var(--bg-app)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--brand)', transition: 'width 300ms' }} />
                  </div>
                )}
                {a && (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', margin: 0 }}>
                    {[
                      plural(a.novas, 'novo', 'novos'), plural(a.completadas, 'completado', 'completados'),
                      a.sem_mudanca ? plural(a.sem_mudanca, 'sem mudança', 'sem mudança') : null,
                      plural(a.com_erro, 'com erro', 'com erro'),
                      a.oportunidades ? plural(a.oportunidades, 'oportunidade', 'oportunidades') : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
                {a?.erro && <Aviso tom="erro">{a.erro}</Aviso>}
                {a && a.erros.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
                    {a.erros.slice(0, 20).map(e => <li key={e.linha}>Linha {e.linha}: {e.motivo}</li>)}
                  </ul>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {a && a.com_erro > 0 && importacaoId && (
                    <a href={`/api/importacoes/${importacaoId}/erros`} download className="btn-ghost"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Download size={14} /> Baixar os erros
                    </a>
                  )}
                  {!rodando && <button type="button" className="btn-ghost" onClick={recomecar}>Importar outro arquivo</button>}
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', margin: 0 }}>
                    Pode sair desta tela: a importação continua.
                  </p>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
