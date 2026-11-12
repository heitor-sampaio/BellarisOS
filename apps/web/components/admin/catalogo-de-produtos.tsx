'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { JanelaModal } from '@/components/shared/janela-modal'
import { SegSelect } from '@/components/shared/seg-select'
import { salvarCatalogoDeProdutos } from '@/actions/stock'
import type { CatalogoDeProdutos } from '@/lib/estoque/catalogo'
import { useFala } from '@/components/shared/uma-unidade'

const TEXTO: Record<CatalogoDeProdutos, string> = {
  UNIDADE: 'cada unidade cadastra e edita',
  REDE:    'só quem administra a clínica cadastra e edita',
}

/**
 * "Quem cadastra e edita os produtos" (C63, H8 do levantamento das regras —
 * "decisão da rede"). Uma linha no cabeçalho do Estoque da rede, que abre a
 * escolha (princípio 7: o caso comum aparece, o raro fica guardado). Só para
 * quem é da rede com o Estoque em Gerenciar; o padrão é a unidade.
 */
export function CatalogoDeProdutosLinha({ regra }: { regra: CatalogoDeProdutos }) {
  const router = useRouter()
  const [aberta, setAberta] = useState(false)
  const [escolha, setEscolha] = useState<CatalogoDeProdutos>(regra)
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, iniciar] = useTransition()
  // A clínica de uma unidade não fala "rede" (F8).
  const fala = useFala()

  function salvar() {
    setErro(null)
    iniciar(async () => {
      const r = await salvarCatalogoDeProdutos(escolha)
      if (r.error) { setErro(r.error); return }
      toast.success('Salvo: quem cadastra os produtos.')
      setAberta(false)
      router.refresh()
    })
  }

  return (
    <>
      <p data-catalogo-de-produtos style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 4 }}>
        Produtos: {TEXTO[regra]} ·{' '}
        <button type="button" onClick={() => { setEscolha(regra); setAberta(true) }}
          style={{ fontSize: 'inherit', fontWeight: 700, color: 'var(--brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          Mudar
        </button>
      </p>
      {aberta && (
        <JanelaModal rotulo="Quem cadastra os produtos" largura={460} travado={gravando} onFechar={() => setAberta(false)}>
          <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Quem cadastra e edita os produtos</h2>
            <SegSelect ariaLabel="Quem cadastra e edita os produtos" value={escolha} onSelect={v => setEscolha(v as CatalogoDeProdutos)}
              options={[
                { key: 'UNIDADE', label: 'A unidade' },
                { key: 'REDE',    label: fala('Só a rede') },
              ]} />
            <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {escolha === 'UNIDADE'
                ? fala('Quem tem o Estoque em Gerenciar, na rede ou numa unidade, cria, edita e desativa produtos.')
                : 'Só quem administra a clínica, sem unidade fixa, cria, edita e desativa produtos. Cada unidade continua com o estoque dela: entrada, ajuste, perda, transferência e o mínimo.'}
            </p>
            {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 700 }}>{erro}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => setAberta(false)} disabled={gravando}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={salvar} disabled={gravando || escolha === regra}>
                {gravando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </JanelaModal>
      )}
    </>
  )
}
