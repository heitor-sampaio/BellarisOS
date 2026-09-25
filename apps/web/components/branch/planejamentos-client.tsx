'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Plus, ClipboardList, Loader2, User } from 'lucide-react'
import { listarPlanejamentos, criarPlanoDoCliente } from '@/actions/treatment-plans'
import { SegSelect } from '@/components/shared/seg-select'
import type { TreatmentProcedure, AvailableProduct } from '@/components/branch/treatment-plan-editor'

/**
 * Tela de planejamentos: lista, busca e criação.
 *
 * A busca acha pelo NOME DO PLANO — o único jeito enquanto não há cliente — e
 * pelos dados de quem já está ligado (nome, CPF, telefone).
 *
 * Cada plano é um **link**, não um `setState`: o plano aberto mora na URL
 * (`…/planejamentos/<id>`), tem a tela inteira e devolve o "voltar" do
 * aparelho. Como camada sobre a lista ele era 780px espremendo um editor com
 * procedimentos, sessões, preços e checkout.
 */

export interface PlanoDaLista {
  id: string; nome: string; status: string; criadoEm: string
  total: number; sessoes: number
  cliente: { id: string; name: string; phone: string | null } | null
  unidade: string | null
}

const FILTROS: { key: string; label: string }[] = [
  { key: '',          label: 'Todos' },
  { key: 'DRAFT',     label: 'Rascunho' },
  { key: 'PROPOSED',  label: 'Aguardando aceite' },
  { key: 'ACCEPTED',  label: 'Aceitos' },
  { key: 'COMPLETED', label: 'Concluídos' },
]

const STATUS: Record<string, { label: string; cor: string; fundo: string }> = {
  DRAFT:     { label: 'Rascunho',          cor: 'var(--text-muted)', fundo: 'var(--bg-app)' },
  PROPOSED:  { label: 'Aguardando aceite', cor: 'var(--warning)', fundo: 'var(--warning-soft)' },
  ACCEPTED:  { label: 'Aceito',            cor: 'var(--success)', fundo: 'var(--success-bg)' },
  COMPLETED: { label: 'Concluído',         cor: 'var(--success)', fundo: 'var(--success-bg)' },
  CANCELLED: { label: 'Cancelado',         cor: 'var(--danger)', fundo: 'var(--danger-soft)' },
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function PlanejamentosClient({
  planosIniciais, branchId, branchName, basePath,
  unidades = [], podeEditar,
}: {
  planosIniciais:    PlanoDaLista[]
  branchId:          string
  branchName:        string | null
  /** Rota da lista — `/admin/planejamentos` ou `/<slug>/planejamentos`. */
  basePath:          string
  /** Unidades da rede — só vem preenchida no portal da rede, onde não há "a atual". */
  unidades?:         { id: string; name: string }[]
  podeEditar:        boolean
}) {
  const router = useRouter()
  const base = basePath.replace(/\/$/, '')
  const [planos, setPlanos] = useState(planosIniciais)
  const [busca,  setBusca]  = useState('')
  const [status, setStatus] = useState('')
  const [buscando, startBusca] = useTransition()

  const [novoAberto, setNovoAberto] = useState(false)
  const [novoNome,   setNovoNome]   = useState('')
  const [criando,    setCriando]    = useState(false)
  const [erro,       setErro]       = useState<string | null>(null)

  // Unidade do plano novo. Na filial é a própria; na rede, a escolhida — e com
  // uma só unidade não há o que perguntar.
  const [novaUnidade, setNovaUnidade] = useState(
    branchId || (unidades.length === 1 ? unidades[0]!.id : ''),
  )
  const precisaEscolherUnidade = !branchId && unidades.length > 1

  // Busca com espera: digitar não dispara uma consulta por tecla.
  useEffect(() => {
    const t = setTimeout(() => {
      startBusca(async () => {
        const res = await listarPlanejamentos({ busca, status: status || undefined, branchId: branchId || null })
        setPlanos(res.planos)
      })
    }, 300)
    return () => clearTimeout(t)
  }, [busca, status, branchId])

  async function criar() {
    if (!novaUnidade) { setErro('Escolha a unidade do plano.'); return }
    setErro(null); setCriando(true)
    const res = await criarPlanoDoCliente(null, novaUnidade, null, novoNome)
    setCriando(false)
    if (res.error || !res.planId) { setErro(res.error ?? 'Não foi possível criar o plano.'); return }
    setNovoAberto(false); setNovoNome('')
    // Abrir o que se acabou de criar é a continuação do gesto. Sem `refresh()`
    // junto: ele entra na mesma transição do `push` e a navegação não sai do
    // lugar — e nem é preciso, porque a lista relê sozinha ao voltar.
    router.push(`${base}/${res.planId}`)
  }

  return (
    <div className="tela-de-lista" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>
            Planejamentos
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', marginTop: 4 }}>
            {branchName ?? 'Rede'} · {planos.length} plano{planos.length !== 1 ? 's' : ''}
          </p>
        </div>
        {podeEditar && (
          <button type="button" onClick={() => setNovoAberto(true)} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <Plus size={15} /> Novo plano
          </button>
        )}
      </div>

      {/* Busca + filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 380, minWidth: 0, width: '100%' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input
            className="field campo-busca"
            style={{ paddingLeft: 32 }}
            placeholder="Nome do plano, cliente, CPF ou telefone…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>
        {/* Escolha exclusiva entre cinco estados fixos: é um segmentado, não
            cinco pílulas soltas. Eram pílulas com raio, borda e altura
            próprias — a mesma escolha desenhada de um jeito diferente do
            resto do sistema. Ver §13 do CLAUDE.md. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <SegSelect
            options={FILTROS}
            value={status}
            onSelect={setStatus}
            ariaLabel="Filtrar por situação do plano"
          />
          {buscando && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-faint)' }} />}
        </div>
      </div>

      {erro && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 8 }}>{erro}</p>
      )}

      {/* Lista */}
      {planos.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '48px 16px' }}>
          <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-squircle)', background: 'var(--bg-app)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={22} style={{ color: 'var(--text-faint)' }} />
          </div>
          <p style={{ fontSize: 'var(--text-base-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>
            {busca || status ? 'Nada encontrado com esse filtro' : 'Nenhum plano ainda'}
          </p>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', textAlign: 'center', maxWidth: 380 }}>
            O plano pode ser montado antes de a pessoa virar cliente — basta dar um nome e ligar a um cadastro depois.
          </p>
        </div>
      ) : (
        <div className="rolagem-da-lista" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {planos.map(p => {
            const st = STATUS[p.status] ?? STATUS.DRAFT!
            return (
              <Link key={p.id} href={`${base}/${p.id}`}
                className="card card-hover"
                style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', textDecoration: 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>{p.nome}</span>
                    <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-chip-token)', color: st.cor, background: st.fundo }}>
                      {st.label}
                    </span>
                  </div>
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                    {p.cliente ? (
                      <><User size={12} /> {p.cliente.name}{p.cliente.phone ? ` · ${p.cliente.phone}` : ''}</>
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>Sem cliente ligado</span>
                    )}
                  </p>
                  <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-faint)', marginTop: 2 }}>
                    {p.sessoes} sessão{p.sessoes !== 1 ? 'ões' : ''}
                    {p.unidade ? ` · ${p.unidade}` : ''}
                    {' · '}{new Date(p.criadoEm).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <span style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', flexShrink: 0 }}>{fmtBRL(p.total)}</span>
              </Link>
            )
          })}
        </div>
      )}

      {/* Novo plano: só o nome. O cliente entra agora ou depois. */}
      {novoAberto && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(34,22,25,0.45)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setNovoAberto(false)}>
          <div className="card" style={{ width: 460, maxWidth: '100%', padding: '22px 24px' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Novo plano</h3>
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginBottom: 16 }}>
              Dê um nome para reencontrar o plano depois. O cliente pode ser ligado agora ou quando houver cadastro.
            </p>
            <input
              className="field"
              autoFocus
              placeholder="Ex.: Harmonização — Marina (indicação)"
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && novoNome.trim() && novaUnidade) void criar() }}
            />

            {/* Na rede o plano precisa dizer de qual unidade é: é ela que define
                o caixa que recebe e a agenda onde as sessões caem. */}
            {precisaEscolherUnidade && (
              <div style={{ marginTop: 12 }}>
                <label className="field-label">Unidade *</label>
                <select className="field" style={{ marginTop: 4 }}
                  value={novaUnidade} onChange={e => setNovaUnidade(e.target.value)}>
                  <option value="">Selecione a unidade…</option>
                  {unidades.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => setNovoAberto(false)} className="btn-ghost">Cancelar</button>
              <button type="button" onClick={criar} disabled={criando || !novoNome.trim() || !novaUnidade} className="btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {criando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
