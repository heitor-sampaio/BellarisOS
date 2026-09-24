'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, Pencil, User, ExternalLink } from 'lucide-react'
import { renomearPlano } from '@/actions/treatment-plans'
import { PlanejamentoTratamento } from '@/components/branch/planejamento-tratamento'
import type { TreatmentProcedure, AvailableProduct } from '@/components/branch/treatment-plan-editor'
import { rotaCliente } from '@/lib/rotas'

/**
 * Um plano de tratamento aberto, em tela inteira.
 *
 * Antes era uma camada sobre a lista, com 780px de largura: no celular cobria a
 * tela e no computador espremia um editor que tem procedimentos, sessões,
 * preços e checkout. Virou rota (`…/planejamentos/<id>`), então tem a tela toda,
 * o "voltar" do aparelho funciona e o link pode ser mandado para alguém.
 *
 * Aqui o voltar aparece SEMPRE — ao contrário de Injetáveis, a lista não fica
 * ao lado em tamanho nenhum.
 */
export function PlanoAberto({
  plano, basePath, branchId, slug,
  procedures, availableProducts, podeEditar, podeReceber,
}: {
  plano: {
    id: string; nome: string; status: string
    cliente: { id: string; name: string } | null
    unidade: string | null
  }
  basePath:  string
  /** Unidade da tela; vazio no portal da rede. */
  branchId:  string
  slug:      string
  procedures:        TreatmentProcedure[]
  availableProducts: AvailableProduct[]
  podeEditar:   boolean
  podeReceber:  boolean
}) {
  const pathname = usePathname()
  const router   = useRouter()

  const [nome, setNome] = useState(plano.nome)
  const [renomeando, setRenomeando] = useState(false)
  const [rascunho, setRascunho] = useState(plano.nome)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvarNome() {
    const novo = rascunho.trim()
    if (!novo) return
    setSalvando(true); setErro(null)
    const res = await renomearPlano(plano.id, novo)
    setSalvando(false)
    if (res.error) { setErro(res.error); return }
    setNome(novo)
    setRenomeando(false)
    // A lista mostra o nome: sem o refresh ela voltaria com o antigo.
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Link href={basePath} className="btn-ghost"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
          fontSize: 'var(--text-sm-sz)', padding: '5px 10px', textDecoration: 'none',
        }}>
        <ChevronLeft size={14} /> Planejamentos
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {/* O nome é como o plano é encontrado enquanto não há cliente. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {renomeando ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="field" autoFocus value={rascunho}
                onChange={e => setRascunho(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && rascunho.trim()) void salvarNome()
                  if (e.key === 'Escape') { setRascunho(nome); setRenomeando(false) }
                }}
                style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, maxWidth: 420 }}
              />
              <button type="button" onClick={salvarNome} disabled={salvando || !rascunho.trim()}
                className="btn-primary" style={{ fontSize: 'var(--text-sm-sz)', padding: '6px 12px' }}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
              <button type="button" onClick={() => { setRascunho(nome); setRenomeando(false) }}
                className="btn-ghost" style={{ fontSize: 'var(--text-sm-sz)', padding: '6px 10px' }}>
                Cancelar
              </button>
            </div>
          ) : (
            <button type="button"
              onClick={() => { setRascunho(nome); setRenomeando(true) }}
              title="Renomear plano"
              disabled={!podeEditar}
              style={{
                background: 'none', border: 'none', padding: 0,
                cursor: podeEditar ? 'pointer' : 'default',
                display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left',
              }}>
              <h1 style={{
                fontSize: 'var(--text-title)', fontWeight: 800,
                letterSpacing: '-0.02em', color: 'var(--text)',
              }}>
                {nome}
              </h1>
              {podeEditar && <Pencil size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
            </button>
          )}

          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
            {plano.cliente ? (
              // O nome leva à ficha — dentro dela viraria link para onde já se está.
              <Link href={rotaCliente(pathname, slug, plano.cliente.id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'inherit', textDecoration: 'none' }}>
                <User size={12} /> {plano.cliente.name} <ExternalLink size={11} />
              </Link>
            ) : (
              <span style={{ color: 'var(--text-faint)' }}>Sem cliente ligado</span>
            )}
            {plano.unidade && ` · ${plano.unidade}`}
          </p>
        </div>
      </div>

      {erro && (
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 600, padding: '8px 12px', background: 'var(--danger-soft)', borderRadius: 8 }}>
          {erro}
        </p>
      )}

      <PlanejamentoTratamento
        clientId={plano.cliente?.id ?? ''}
        planIdInicial={plano.id}
        branchId={branchId}
        slug={slug}
        procedures={procedures}
        availableProducts={availableProducts}
        podeEditar={podeEditar}
        podeReceber={podeReceber}
      />
    </div>
  )
}
