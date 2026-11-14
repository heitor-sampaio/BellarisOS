'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { avisoDaVenda } from '@/lib/vendas/aviso-da-venda'
import { formatBRL } from '@estetica-os/utils'
import { venderPacote, type DocumentoDaVenda } from '@/actions/pacotes'
import Link from 'next/link'
import { rotaNoPortal } from '@/lib/rotas'
import { schedulePackageSession } from '@/actions/appointments'
import { SessionScheduler } from '@/components/branch/treatment-sessions-modal'
import { CamposDoPagamento, estadoDoPagamento, montarPagamento, useRecusaDoPagamento } from '@/components/shared/campos-do-pagamento'
import { CampoDoDesconto, SEM_DESCONTO, contaDoDesconto, descontoDoEstado } from '@/components/shared/campo-do-desconto'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { CampoQuemVendeu, PerguntaDaVenda } from '@/components/shared/pergunta-da-venda'
import { textoDaComissaoDaVenda, type RegraDeVenda } from '@/lib/comissoes/comissao-da-venda'
import type { MembroDaVenda } from '@/components/shared/vender'
import { useFuso } from '@/components/shared/fuso'
import { useFidelidadeNaVenda } from '@/components/shared/pontos-na-venda'
import type { FidelidadeDaVenda } from '@/lib/fidelidade/conta-na-venda'

/**
 * Vender um pacote (decisão do Heitor, 2026-09-30): o pacote do catálogo, e
 * como vai ser pago — à vista, entrada + parcelas ou a receber, o vocabulário
 * do plano. As sessões nascem na venda; o que ficar a receber aparece no
 * financeiro como qualquer conta a receber. A janela é o "Vender" único.
 */

export interface PacoteAVenda {
  id: string; name: string; price: number; totalSessions: number
  /** "5× Limpeza + 3× Drenagem". */
  composicao: string; validityDays: number | null
  /** O pacote paga quem atende sobre o valor dele (com-04): a venda pede a profissional responsável. */
  pedeResponsavel?: boolean
  /** A18 da 12ª: o "De venda" do pacote — vence a comissão de venda da pessoa. */
  comissaoVenda?: RegraDeVenda | null
}

/** O que ficou para assinar depois da venda (PC2) — a venda não espera a assinatura. */
function avisoDosDocumentos(docs: DocumentoDaVenda[]): string {
  const incompletos = docs.filter(d => d.status === 'INCOMPLETO').length
  const base = docs.length === 1
    ? `Ficou 1 documento para a cliente assinar: ${docs[0]!.titulo}.`
    : `Ficaram ${docs.length} documentos para a cliente assinar, numa assinatura só.`
  return incompletos ? `${base} ${incompletos === 1 ? '1 depende' : `${incompletos} dependem`} de completar o cadastro. Estão na ficha, em Documentos.` : `${base} Estão na ficha, em Documentos.`
}

/** O formulário da venda do pacote — dentro do "Vender" (`components/shared/vender.tsx`). */
export function FormularioDoPacote({ clienteId, branchId, pacotes, onFim, equipe = [], podeAgendar = false, fidelidade = null }: {
  clienteId: string; branchId: string; pacotes: PacoteAVenda[]; onFim: () => void
  /** Depois de vender, oferece "Agendar a 1ª sessão agora" (A47 da 7ª; agenda: MANAGE), como o pré-pago. */
  podeAgendar?: boolean
  /** A equipe da unidade: a responsável sai de quem atende (com-04). */
  equipe?: MembroDaVenda[]
  /** FD2a: os pontos e os vouchers de desconto da cliente, para a venda à vista. */
  fidelidade?: FidelidadeDaVenda | null
}) {
  const fuso = useFuso()
  const router = useRouter()
  const pathname = usePathname()
  // Depois da venda: a 1ª sessão, para o "Agendar a 1ª sessão agora" (A47).
  const [vendida, setVendida] = useState<{ id: string; procedimento: { id: string; nome: string; duracaoMin: number } } | null>(null)
  // PC2: os documentos que a venda deixou para assinar — a venda não espera.
  const [docsDaVenda, setDocsDaVenda] = useState<DocumentoDaVenda[]>([])
  const [pacoteId, setPacoteId] = useState(pacotes[0]!.id)
  const [estado, setEstado] = useState(() => estadoDoPagamento(null, 'AVISTA', fuso))
  // C75: com mais de uma maquininha, o cartão não segue sem "Qual maquininha?".
  const recusaDoPagamento = useRecusaDoPagamento()
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const pacote = pacotes.find(p => p.id === pacoteId) ?? pacotes[0]!
  const [desconto, setDesconto] = useState(SEM_DESCONTO)
  const conta = contaDoDesconto(pacote.price, desconto)
  // FD2a: o voucher e os pontos, à vista; o pagamento é o que sobra.
  const fid = useFidelidadeNaVenda(fidelidade, conta.liquido, estado.forma)
  // A chave do envio (D10): o duplo clique vende uma vez só.
  const envio = useEnvioUnico()
  // com-04: a profissional responsável, quando o pacote paga quem atende sobre o valor dele.
  const [responsavelId, setResponsavelId] = useState('')
  // "Quem vendeu" (com-06): nasce VAZIO (r2-ven-12); vazio, a venda pergunta.
  const [vendedorId, setVendedorId] = useState('')
  const [pergunta, setPergunta] = useState<{ texto: string; sem: 'VENDEDOR' | 'RESPONSAVEL' } | null>(null)
  const [semVendedor, setSemVendedor] = useState(false)
  const quemAtende = equipe.filter(m => m.atende)

  function vender(resposta: { semVendedor?: boolean; semResponsavel?: boolean } = {}) {
    setErro(recusaDoPagamento(estado, fid.aPagar))
    if (recusaDoPagamento(estado, fid.aPagar)) return
    const semV = resposta.semVendedor ?? semVendedor
    if (resposta.semVendedor) setSemVendedor(true)
    iniciar(async () => {
      const r = await venderPacote(clienteId, pacote.id, branchId, montarPagamento(estado), descontoDoEstado(desconto), envio.chave(),
        { vendedorId: vendedorId || null, semVendedor: semV,
          responsavelId: pacote.pedeResponsavel ? responsavelId || null : null, semResponsavel: resposta.semResponsavel === true },
        fid.paraEnviar)
      if (r.confirmarSemVendedor) { setPergunta({ texto: r.confirmarSemVendedor, sem: 'VENDEDOR' }); return }
      if (r.confirmarSemResponsavel) { setPergunta({ texto: r.confirmarSemResponsavel, sem: 'RESPONSAVEL' }); return }
      if (r.error) { setErro(r.error); return }
      envio.renovar()
      router.refresh()
      const docs = r.documentos ?? []
      if (podeAgendar && r.primeiraSessao) { setDocsDaVenda(docs); setVendida(r.primeiraSessao); return }
      toast.success(avisoDaVenda(pacote.name, fid.aPagar, estado.forma),
        docs.length ? { description: avisoDosDocumentos(docs) } : undefined)
      onFim()
    })
  }

  if (vendida) return (
    <div data-agendar-a-primeira-sessao style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
        Venda registrada. <strong>Agendar a 1ª sessão agora?</strong> As outras ficam na ficha, para agendar depois.
      </p>
      {docsDaVenda.length > 0 && (
        <div data-documentos-da-venda style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{avisoDosDocumentos(docsDaVenda)}</p>
          {docsDaVenda.some(d => d.status === 'PENDENTE') && (
            <Link href={rotaNoPortal(pathname, pathname.split('/')[1], `/documentos/${docsDaVenda.find(d => d.status === 'PENDENTE')!.id}/assinar`)}
              style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>
              Colher a assinatura agora
            </Link>
          )}
        </div>
      )}
      <SessionScheduler
        branches={[{ id: branchId, name: '' }]}
        currentBranchId={branchId}
        procedimento={vendida.procedimento}
        onCancel={onFim}
        onSave={async ({ branchId: unidade, professionalId, scheduledAt, roomId }) => {
          const r = await schedulePackageSession({
            packageSessionId: vendida.id, branchId: unidade, professionalId, scheduledAt, roomId,
            clientId: clienteId, procedureId: vendida.procedimento.id, price: 0, durationMin: 0,
            slug: pathname.split('/')[1] ?? '',
          })
          if (r.error) return { error: r.error }
          router.refresh()
          onFim()
          return {}
        }}
      />
    </div>
  )

  const texto = { fontSize: 'var(--text-sm-sz)', color: 'var(--text-soft)' } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="overline">Pacote</span>
        <select className="field" aria-label="Pacote" value={pacoteId} onChange={e => { setPacoteId(e.target.value); setPergunta(null) }}>
          {pacotes.map(p => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>)}
        </select>
      </label>
      <p style={texto} data-resumo-do-pacote>
        {pacote.composicao} ({pacote.totalSessions} sessões) · {formatBRL(pacote.price)}
        {pacote.validityDays ? ` · válido por ${pacote.validityDays} dias` : ''}
      </p>
      <CampoQuemVendeu equipe={equipe} valor={vendedorId} aoMudar={id => { setVendedorId(id); setPergunta(null); setSemVendedor(false) }}
        comissao={(() => {
          // A18 da 12ª: a comissão de venda de quem vendeu, e de onde vem (o pacote vence a pessoa).
          const quem = equipe.find(m => m.id === vendedorId)
          return quem ? textoDaComissaoDaVenda({ tipo: 'PACOTE', pessoa: { nome: quem.nome, pct: quem.comissaoVendaPct }, itens: [{ regra: pacote.comissaoVenda ?? null }] }) : null
        })()} />
      {pacote.pedeResponsavel && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="overline">Profissional responsável</span>
          <select className="field" aria-label="Profissional responsável" value={responsavelId}
            onChange={e => { setResponsavelId(e.target.value); setPergunta(null) }}>
            <option value="">Ninguém</option>
            {quemAtende.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            Recebe a comissão de quem atende sobre o valor do pacote, quando ele estiver pago por inteiro.
          </span>
        </label>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <p className="overline">Pagamento</p>
        <CampoDoDesconto estado={desconto} aoMudar={setDesconto} total={pacote.price} comMotivo />
        <CamposDoPagamento estado={estado} aoMudar={setEstado} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']} total={fid.aPagar} clienteId={clienteId} />
        {fid.bloco}
        {estado.forma === 'A_RECEBER' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>O valor fica a receber no financeiro, com o vencimento, se você informar um.</p>
        )}
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {pergunta ? (
        <PerguntaDaVenda texto={pergunta.texto} pendente={pendente}
          rotuloConfirmar={pergunta.sem === 'RESPONSAVEL' ? 'Vender sem responsável' : 'Vender assim'}
          aoConfirmar={() => vender(pergunta.sem === 'RESPONSAVEL' ? { semResponsavel: true } : { semVendedor: true })}
          aoVoltar={() => setPergunta(null)} />
      ) : (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={() => vender()} disabled={pendente || !!conta.recusa || !!fid.recusa || !!recusaDoPagamento(estado, fid.aPagar)}>{pendente ? 'Vendendo…' : `Vender por ${formatBRL(fid.aPagar)}`}</button>
      </div>
      )}
    </div>
  )
}
