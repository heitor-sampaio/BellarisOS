'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { avisoDaVenda } from '@/lib/vendas/aviso-da-venda'
import { avisoDosDocumentosDaVenda, avisoDoContratoAntesDeVender, avisoDoJaAssinou } from '@/lib/documentos/aviso-da-venda'
import { formatBRL } from '@estetica-os/utils'
import { venderPacote, type DocumentoDaVenda } from '@/actions/pacotes'
import { documentoParaAssinar } from '@/actions/documentos'
import { TelaDeAssinatura, type DocumentoNaTela } from '@/components/shared/tela-de-assinatura'
import { EnviarLinkDeAssinatura } from '@/components/shared/enviar-link-de-assinatura'
import { avisoDasVazias } from '@/lib/documentos/variaveis'
import type { ContratoParaAssinar } from '@/lib/documentos/pacote'
import Link from 'next/link'
import { rotaNoPortal, rotaCliente } from '@/lib/rotas'
import { schedulePackageSession } from '@/actions/appointments'
import { SessionScheduler } from '@/components/branch/treatment-sessions-modal'
import { CamposDoPagamento, estadoDoPagamento, montarPagamento, useRecusaDoPagamento, recusaForaDoCampo, MotivoDoBotao } from '@/components/shared/campos-do-pagamento'
import { CampoDoDesconto, SEM_DESCONTO, contaDoDesconto, descontoDoEstado } from '@/components/shared/campo-do-desconto'
import { useEnvioUnico } from '@/lib/use-envio-unico'
import { CampoQuemVendeu, PerguntaDaVenda } from '@/components/shared/pergunta-da-venda'
import { textoDaComissaoDaVenda, type RegraDeVenda } from '@/lib/comissoes/comissao-da-venda'
import type { MembroDaVenda } from '@/components/shared/vender'
import { useFuso } from '@/components/shared/fuso'
import { useFidelidadeNaVenda } from '@/components/shared/pontos-na-venda'
import type { FidelidadeDaVenda } from '@/lib/fidelidade/conta-na-venda'
import { Dica } from '@/components/shared/dica'

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

/** A6 da 18ª: o contrato de pacote ativo e o que ele pede do cadastro da cliente que falta. */
export interface ContratoQuePedeCadastro {
  titulo:   string
  faltando: string[]
  /** Quem edita Clientes completa ali mesmo ("Completar o cadastro"). */
  podeCompletar: boolean
}

/** O formulário da venda do pacote — dentro do "Vender" (`components/shared/vender.tsx`). */
export function FormularioDoPacote({ clienteId, branchId, pacotes, onFim, equipe = [], podeAgendar = false, fidelidade = null, contratoQuePedeCadastro = null }: {
  clienteId: string; branchId: string; pacotes: PacoteAVenda[]; onFim: () => void
  /** A6 da 18ª: avisa ANTES de vender o que o contrato pede do cadastro e falta. */
  contratoQuePedeCadastro?: ContratoQuePedeCadastro | null
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
  const rotaDosDados = `${rotaCliente(pathname, pathname.split('/')[1] ?? '', clienteId)}?aba=dados`
  // Depois da venda: a 1ª sessão, para o "Agendar a 1ª sessão agora" (A47).
  const [vendida, setVendida] = useState<{ id: string; procedimento: { id: string; nome: string; duracaoMin: number } } | null>(null)
  // PC2: os termos e os outros documentos que a venda deixou para assinar (esses não seguram o dinheiro).
  // O CONTRATO de pacote, sim: "primeiro colhe assinatura, depois paga" (auditoria de 2026-11-18).
  const [contrato, setContrato] = useState<ContratoParaAssinar | null>(null)
  const [assinando, setAssinando] = useState<DocumentoNaTela | null>(null)
  const [contratoAssinado, setContratoAssinado] = useState(false)
  const [docsDaVenda, setDocsDaVenda] = useState<DocumentoDaVenda[]>([])
  // D1 da 15ª: quem vendeu colhe a assinatura (2026-11-16: sem o módulo
  // Documentos); `veNaFicha`, se ela vê a ficha da cliente.
  const [veNaFicha, setVeNaFicha] = useState(true)
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
  const [pergunta, setPergunta] = useState<{ texto: string; sem: 'VENDEDOR' | 'RESPONSAVEL' | 'CONTRATO' } | null>(null)
  const [semVendedor, setSemVendedor] = useState(false)
  const quemAtende = equipe.filter(m => m.atende)

  /** PC2: o contrato a colher abre a tela de assinatura AQUI dentro (sair perderia o pagamento escolhido). */
  function abrirContrato(id: string) {
    setErro(null)
    iniciar(async () => {
      const r = await documentoParaAssinar(id)
      if (r.error || !r.doc) { setErro(r.error ?? 'Não consegui abrir o contrato.'); return }
      setAssinando(r.doc)
    })
  }

  /** De volta da assinatura: assinado, é vender; senão, o contrato segue à vista. */
  function voltarDoContrato(id: string) {
    setAssinando(null)
    iniciar(async () => {
      const r = await documentoParaAssinar(id)
      if (r.doc?.status === 'ASSINADO') { setContrato(null); setContratoAssinado(true) }
    })
  }

  /** Mudou o que o contrato cita (o pacote, o pagamento, o desconto): ele se monta de novo ao vender. */
  function esquecerContrato() { setContrato(null); setContratoAssinado(false) }

  function vender(resposta: { semVendedor?: boolean; semResponsavel?: boolean; substituirContrato?: boolean } = {}) {
    setErro(recusaDoPagamento(estado, fid.aPagar))
    if (recusaDoPagamento(estado, fid.aPagar)) return
    const semV = resposta.semVendedor ?? semVendedor
    if (resposta.semVendedor) setSemVendedor(true)
    iniciar(async () => {
      const r = await venderPacote(clienteId, pacote.id, branchId, montarPagamento(estado, fid.aPagar), descontoDoEstado(desconto), envio.chave(),
        { vendedorId: vendedorId || null, semVendedor: semV,
          responsavelId: pacote.pedeResponsavel ? responsavelId || null : null, semResponsavel: resposta.semResponsavel === true,
          substituirContrato: resposta.substituirContrato === true },
        fid.paraEnviar)
      if (r.confirmarSemVendedor) { setPergunta({ texto: r.confirmarSemVendedor, sem: 'VENDEDOR' }); return }
      if (r.confirmarSemResponsavel) { setPergunta({ texto: r.confirmarSemResponsavel, sem: 'RESPONSAVEL' }); return }
      if (r.confirmarSubstituirContrato) { setPergunta({ texto: r.confirmarSubstituirContrato, sem: 'CONTRATO' }); return }
      // PC2: nada se gravou — o contrato primeiro, depois o pagamento.
      if (r.contratoParaAssinar) {
        // A5(b) da 25ª: o "Já assinou: vender" sem a assinatura diz por que não vendeu.
        const aviso = avisoDoJaAssinou(contrato?.id ?? null, r.contratoParaAssinar)
        setPergunta(null); setContratoAssinado(false); setContrato(r.contratoParaAssinar)
        if (aviso) setErro(aviso)
        return
      }
      if (r.error) { setErro(r.error); return }
      envio.renovar()
      router.refresh()
      const docs = r.documentos ?? []
      const naFicha = !!r.veOsDocumentos
      if (podeAgendar && r.primeiraSessao) { setDocsDaVenda(docs); setVeNaFicha(naFicha); setVendida(r.primeiraSessao); return }
      // A11 da 20ª: o aviso diz "Completado o cadastro…" — quem edita os Clientes ganha o botão junto.
      const completar = docs.some(d => d.status === 'INCOMPLETO') && contratoQuePedeCadastro?.podeCompletar
        ? { label: 'Completar o cadastro', onClick: () => router.push(rotaDosDados) } : undefined
      toast.success(avisoDaVenda(pacote.name, fid.aPagar, estado.forma),
        docs.length ? { description: avisoDosDocumentosDaVenda(docs, { veNaFicha: naFicha }), action: completar } : undefined)
      onFim()
    })
  }

  if (assinando && contrato) return (
    <TelaDeAssinatura doc={assinando} podeColher aoTerminar={() => voltarDoContrato(contrato.id)} />
  )

  if (vendida) return (
    <div data-agendar-a-primeira-sessao style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
        Venda registrada. <strong>Agendar a 1ª sessão agora?</strong> As outras ficam na ficha, para agendar depois.
      </p>
      {docsDaVenda.length > 0 && (
        <div data-documentos-da-venda style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 'var(--radius-field-token)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>{avisoDosDocumentosDaVenda(docsDaVenda, { veNaFicha })}</p>
          {docsDaVenda.some(d => d.status === 'PENDENTE') && (
            // A16 da 24ª: com cara de botão (era um link com cara de texto).
            <Link href={rotaNoPortal(pathname, pathname.split('/')[1], `/documentos/${docsDaVenda.find(d => d.status === 'PENDENTE')!.id}/assinar`)}
              className="btn-secondary" style={{ alignSelf: 'flex-start' }}>
              Colher a assinatura agora
            </Link>
          )}
          {/* A11 da 20ª: depois da venda, o "Completado o cadastro" do aviso vem com o botão. */}
          {docsDaVenda.some(d => d.status === 'INCOMPLETO') && contratoQuePedeCadastro?.podeCompletar && (
            <Link data-completar-depois-da-venda href={rotaDosDados}
              style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>
              Completar o cadastro
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
        <select className="field" aria-label="Pacote" value={pacoteId} onChange={e => { setPacoteId(e.target.value); setPergunta(null); esquecerContrato() }}>
          {pacotes.map(p => <option key={p.id} value={p.id}>{p.name} — {formatBRL(p.price)}</option>)}
        </select>
      </label>
      {/* A6 da 18ª (princípios 3 e 7): o contrato pede o endereço — o balcão sabe ANTES de vender. */}
      {contratoQuePedeCadastro && (
        <div data-contrato-pede-cadastro role="note" style={{
          display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 'var(--radius-field-token)',
          background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
        }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 'var(--weight-semibold)' }}>
            {avisoDoContratoAntesDeVender(contratoQuePedeCadastro)}
          </p>
          {contratoQuePedeCadastro.podeCompletar && (
            <Link href={rotaDosDados}
              style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>
              Completar o cadastro
            </Link>
          )}
        </div>
      )}
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
        // Um <div>, não <label>: o botão da dica dentro do rótulo o roubaria do seletor
        // (o seletor tem o próprio aria-label).
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="overline">Profissional responsável</span>
            {/* 2026-11-16: era uma linha fixa embaixo do seletor. */}
            <Dica rotulo="Sobre o profissional responsável">
              Recebe a comissão de quem atende sobre o valor do pacote, quando ele estiver pago por inteiro.
            </Dica>
          </span>
          <select className="field" aria-label="Profissional responsável" value={responsavelId}
            onChange={e => { setResponsavelId(e.target.value); setPergunta(null) }}>
            <option value="">Ninguém</option>
            {quemAtende.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--hairline)', paddingTop: 14 }}>
        <p className="overline">Pagamento</p>
        <CampoDoDesconto estado={desconto} aoMudar={d => { setDesconto(d); esquecerContrato() }} total={pacote.price} comMotivo />
        <CamposDoPagamento estado={estado} aoMudar={e => { setEstado(e); esquecerContrato() }} formas={['AVISTA', 'PARCELADO', 'A_RECEBER']} total={fid.aPagar} clienteId={clienteId} variasFormas />
        {fid.bloco}
        {estado.forma === 'A_RECEBER' && (
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>O valor fica a receber no financeiro, com o vencimento, se você informar um.</p>
        )}
      </div>
      {/* PC2 (auditoria de 2026-11-18): "primeiro colhe assinatura, depois paga" — o contrato do pacote antes do dinheiro. */}
      {contrato && (
        <div data-contrato-antes-de-vender={contrato.id} role="note" style={{
          display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 'var(--radius-field-token)',
          background: 'var(--brand-soft)', border: '1px solid var(--brand-soft-border)',
        }}>
          <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 'var(--weight-semibold)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Antes do pagamento, a cliente assina o contrato: {contrato.titulo}.</span>
            <Dica rotulo="Por que o contrato vem antes">
              O contrato cita o pagamento escolhido. Assinado, a venda segue. Quem dispensa documentos pode dispensá-lo, com o motivo, na ficha da cliente.
            </Dica>
          </p>
          {contrato.status === 'INCOMPLETO' && (
            <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
              Falta no cadastro: {contrato.faltando.join(', ')}.{' '}
              <Link href={rotaDosDados} style={{ color: 'var(--brand)', fontWeight: 'var(--weight-bold)' }}>Completar o cadastro</Link>
            </p>
          )}
          {avisoDasVazias(contrato.vazias) && (
            <p data-variaveis-vazias style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
              {avisoDasVazias(contrato.vazias)}
            </p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {contrato.status === 'PENDENTE' && (
              <button type="button" className="btn-primary" disabled={pendente} onClick={() => abrirContrato(contrato.id)}>Colher assinatura</button>
            )}
            {contrato.status === 'PENDENTE' && <EnviarLinkDeAssinatura documentoId={contrato.id} jaEnviadoAte={contrato.linkAte} />}
            <button type="button" className="btn-secondary" disabled={pendente} onClick={() => vender()}>Já assinou: vender</button>
          </div>
        </div>
      )}
      {contratoAssinado && !contrato && (
        <p data-contrato-assinado role="status" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--success)', fontWeight: 'var(--weight-semibold)' }}>
          Contrato assinado. Agora, o pagamento.
        </p>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>{erro}</p>}
      {pergunta ? (
        <PerguntaDaVenda texto={pergunta.texto} pendente={pendente}
          rotuloConfirmar={pergunta.sem === 'RESPONSAVEL' ? 'Vender sem responsável' : pergunta.sem === 'CONTRATO' ? 'Substituir o contrato' : 'Vender assim'}
          aoConfirmar={() => vender(pergunta.sem === 'RESPONSAVEL' ? { semResponsavel: true } : pergunta.sem === 'CONTRATO' ? { substituirContrato: true } : { semVendedor: true })}
          aoVoltar={() => setPergunta(null)} />
      ) : (
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <MotivoDoBotao motivo={pendente || erro ? null : recusaForaDoCampo(estado, fid.aPagar, recusaDoPagamento(estado, fid.aPagar))} />
        <button type="button" className="btn-secondary" onClick={onFim} disabled={pendente}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={() => vender()} disabled={pendente || !!conta.recusa || !!fid.recusa || !!recusaDoPagamento(estado, fid.aPagar)}>{pendente ? 'Vendendo…' : `Vender por ${formatBRL(fid.aPagar)}`}</button>
      </div>
      )}
    </div>
  )
}
