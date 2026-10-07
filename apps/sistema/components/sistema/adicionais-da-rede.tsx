'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { definirAdicional } from '@/actions/sistema'
import { ADICIONAIS, adicionalCabeNoPlano, type ChaveDeAdicional, type OfertaDosAdicionais, type RecursosDoPlano } from '@estetica-os/nucleo/lib/planos/recursos'
import { totalDosAdicionais, type AdicionaisContratados } from '@estetica-os/nucleo/lib/planos/adicionais'
import { centavosDe, campoDeReais, reaisDe } from '@estetica-os/nucleo/lib/redes/valor'

/**
 * Os ADICIONAIS da rede, no sistema (2026-10-07): quantas conexões de WhatsApp
 * além do limite, e o Copilot avulso — cada um com o preço (o do plano, ou um
 * especial). A clínica também contrata pela aba Assinatura; as duas portas
 * passam pela mesma função do banco. O total é o que o Asaas cobra.
 */
export function AdicionaisDaRede({ tenantId, recursos, oferta, adicionais, valorCentavos, totalCentavos }: {
  tenantId: string
  recursos: RecursosDoPlano | null
  /** O que o plano oferece HOJE (o catálogo), com o preço. */
  oferta: OfertaDosAdicionais
  adicionais: AdicionaisContratados
  valorCentavos: number
  totalCentavos: number
}) {
  if (!recursos) {
    return <p className="suporte-texto-fraco">Sem plano, a rede usa tudo e não há adicional a contratar.</p>
  }
  return (
    <div className="suporte-pilha">
      {ADICIONAIS.map(a => (
        <LinhaDoAdicional key={a.chave} tenantId={tenantId} chave={a.chave} rotulo={a.rotulo} maximo={a.maximo}
          cabe={adicionalCabeNoPlano(recursos, a.chave)} oferta={oferta[a.chave]?.valor_centavos ?? null} contratado={adicionais[a.chave] ?? null} />
      ))}
      <p className="suporte-texto">
        Mensalidade com isto: <strong>{reaisDe(totalCentavos)}</strong>
        {totalCentavos !== valorCentavos + totalDosAdicionais(adicionais) ? (
          // Com cortesia ou desconto (Cortesia e desconto, logo abaixo), a soma não é mais plano + adicionais.
          <span className="suporte-texto-fraco"> (preço cheio: {reaisDe(valorCentavos + totalDosAdicionais(adicionais))})</span>
        ) : totalCentavos !== valorCentavos && (
          <span className="suporte-texto-fraco"> (plano {reaisDe(valorCentavos)} + adicionais {reaisDe(totalCentavos - valorCentavos)})</span>
        )}
      </p>
    </div>
  )
}

function LinhaDoAdicional({ tenantId, chave, rotulo, maximo, cabe, oferta, contratado }: {
  tenantId: string; chave: ChaveDeAdicional; rotulo: string; maximo: number; cabe: boolean
  oferta: number | null; contratado: { quantidade: number; valor_centavos: number; especial?: true } | null
}) {
  const router = useRouter()
  const [quantidade, setQuantidade] = useState(String(contratado?.quantidade ?? 0))
  const [preco, setPreco] = useState(campoDeReais(contratado?.valor_centavos ?? oferta))
  const [pendente, iniciar] = useTransition()

  function salvar() {
    const q = Number(quantidade)
    if (!Number.isInteger(q) || q < 0 || q > maximo) { toast.error(`Quantidade de 0 a ${maximo}.`); return }
    const valor = preco.trim() ? centavosDe(preco) : null
    if (preco.trim() && valor == null) { toast.error('Preço inválido.'); return }
    iniciar(async () => {
      const r = await definirAdicional(tenantId, { chave, quantidade: q, valorCentavos: valor })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Adicional salvo.')
      router.refresh()
    })
  }

  return (
    <fieldset className="sistema-adicional">
      <legend className="field-label">{rotulo}</legend>
      {!cabe ? (
        <p className="suporte-texto-fraco">
          {chave === 'whatsapp' ? 'O plano da rede já tem números de WhatsApp ilimitados.' : 'O plano da rede já inclui o Copilot.'}
        </p>
      ) : (
        <div className="sistema-acoes">
          <label className="suporte-campo"><span className="suporte-texto-fraco">Quantidade</span>
            <input className="field" type="number" min={0} max={maximo} step={1} value={quantidade}
              onChange={e => setQuantidade(e.target.value)} data-largura="quantidade" />
          </label>
          <label className="suporte-campo"><span className="suporte-texto-fraco">Preço por mês (R$)</span>
            <input className="field" inputMode="decimal" placeholder="0,00" value={preco} onChange={e => setPreco(e.target.value)} data-largura="preco" />
          </label>
          <button type="button" className="btn-secondary" disabled={pendente} onClick={salvar}>{pendente ? 'Salvando…' : 'Salvar'}</button>
          <span className="suporte-texto-fraco">
            {oferta != null ? `O plano oferece por ${reaisDe(oferta)}${chave === 'whatsapp' ? ' cada' : ''}.` : 'O plano não oferece: dê um preço.'}
            {contratado && ` Contratado: ${contratado.quantidade} × ${reaisDe(contratado.valor_centavos)}${contratado.especial ? ' (condição especial: a clínica não aumenta sozinha)' : ''}.`}
          </span>
        </div>
      )}
    </fieldset>
  )
}
