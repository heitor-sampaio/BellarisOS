'use client'

import {
  useRef, useCallback, useActionState, useEffect, useEffectEvent, useMemo,
  useState, forwardRef, useImperativeHandle, useId,
} from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { X, UserPlus, CheckCircle2, Check, Plus, MessageSquare, CalendarPlus } from 'lucide-react'
import { ScheduleModal } from '@/components/admin/inbox-lead-panel'
import type { PessoaParaNovoLead } from '@/lib/crm/pessoa-para-novo-lead'
import { createLead, updateLead, responsaveisParaOportunidade, fichaDoTelefoneDoLead } from '@/actions/leads'
import { openLeadConversation } from '@/actions/inbox'
import { rotaInbox } from '@/lib/rotas'
import type { CRMFunnel, CRMStage } from '@/lib/crm'
import { StageOptions } from './stage-options'
import { MotivoDaPerdaCampos, type OpcaoDeMotivo } from './pergunta-da-perda'
import { listarMotivosDePerda } from '@/actions/crm-motivos'
import { LeadTimeline } from './lead-timeline'
import type { Lead } from './crm-board'
import { LEAD_SOURCES, unitTag, maskPhone as telefoneParaExibir, maskTelefoneDigitando, telefoneDoCadastro } from '@estetica-os/utils'
import { TagBadge } from '@/components/shared/tag-badge'
import { useTagsDaRede } from '@/components/shared/use-tags-da-rede'
import { useOrigensDaRede } from '@/components/shared/use-origens-da-rede'

export interface Procedure { id: string; name: string }

interface ExistingLead {
  id:             string
  name:           string
  phone?:         string | null
  email?:         string | null
  social_media?:  string | null
  source?:        string | null
  notes?:         string | null
  crm_stage_id?:  string | null
  tags?:          string[] | null
  lead_procedures?: { procedure_id: string }[]
  owner_id?:      string | null
  owner_name?:    string | null
  /** A42 da 9ª: o lembrete de retorno. */
  retornar_em?:   string | null
  retornar_obs?:  string | null
}

type Responsaveis = Awaited<ReturnType<typeof responsaveisParaOportunidade>>

export interface CRMLeadModalHandle {
  open: () => void
}

export interface CRMBranch { id: string; name: string; slug: string }

interface CRMLeadModalProps {
  /** Modo filial: passar branchId + slug diretamente */
  branchId?:       string
  slug?:           string
  /** Portal da unidade: lead novo já nasce com a tag desta unidade. */
  branchName?:     string
  /** Modo rede: a presença desta lista é o que liga o modo rede do card. */
  branches?:       CRMBranch[]
  /**
   * Unidades da rede, oferecidas como sugestão de tag. Separado de `branches`
   * de propósito: o portal da unidade precisa das sugestões sem virar modo rede.
   */
  unidades?:       { id: string; name: string }[]
  /** Todas as etapas da rede: é o que permite mover o lead para outro funil. */
  stages:          CRMStage[]
  /** Funis ativos, para agrupar as etapas do seletor. */
  funnels?:        Pick<CRMFunnel, 'id' | 'name'>[]
  /** Funil aberto no quadro — define onde o lead novo cai. */
  funnelId?:       string
  procedures:      Procedure[]
  initialStageId?: string
  existing?:       ExistingLead
  trigger?:        React.ReactNode
  onLeadCreated?:  (lead: Lead) => void
  /**
   * "Agendar" no card (A16 da 6ª simulação): as unidades em que se agenda e a
   * ficha já ligada ao lead. Ausente, o botão não aparece (sem o CRM em
   * Gerenciar ou sem a agenda no plano).
   */
  agendar?:        { unidades: CRMBranch[]; clienteId: string | null }
  /**
   * A pessoa do CRM sem oportunidade que a busca universal mandou (A15,
   * `?contato=`): o "Novo lead" abre sozinho com os dados dela, e a
   * oportunidade nasce ligada a ELA (`_contatoId`). Os dados vêm do servidor.
   */
  novoDaPessoa?:   PessoaParaNovoLead | null
}

/**
 * O telefone gravado, para o campo (J-19): o do WhatsApp ("5541992000040")
 * aparecia cru. Com a máscara de exibição; o que não é número nacional fica.
 */
const telefoneDoCampo = (v: string | null | undefined) => (v ? telefoneParaExibir(v) : '')

/** O rótulo LIGADO ao campo pelo id (J-20: "Origem" e "Etapa" eram soltos). */
function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} style={{
      fontSize: 'var(--text-xs-sz)', fontWeight: 700,
      color: 'var(--text-muted)', letterSpacing: '0.04em',
    }}>
      {children}
    </label>
  )
}

export const CRMLeadModal = forwardRef<CRMLeadModalHandle, CRMLeadModalProps>(
  function CRMLeadModal(
    {
      slug, branchName, branches, unidades, stages, funnels, funnelId, procedures,
      initialStageId, existing, trigger, onLeadCreated, agendar, novoDaPessoa,
    },
    ref,
  ) {
    const [agendando, setAgendando] = useState(false)
    // A pessoa da busca vale para UMA abertura: fechada a janela, o "Novo lead" volta vazio.
    const [pessoa, setPessoa] = useState(existing ? null : (novoDaPessoa ?? null))
    const isEdit    = !!existing
    const action    = isEdit ? updateLead : createLead
    const dialogRef = useRef<HTMLDialogElement>(null)
    const router    = useRouter()
    const pathname  = usePathname()

    // O que foi ENVIADO, guardado na hora: o React 19 limpa o formulário depois
    // da action, e o card otimista lia o nome do campo já vazio (o "+" da
    // coluna criava card sem nome — simulação de 2026-10-20).
    const enviado = useRef<FormData | null>(null)
    const [state, formAction, pending] = useActionState(
      (anterior: Awaited<ReturnType<typeof action>> | undefined, dados: FormData) => {
        enviado.current = dados
        return action(anterior as never, dados)
      },
      undefined,
    )
    const [phone,           setPhone]           = useState(telefoneDoCampo(existing?.phone))
    const [selectedProcs,   setSelectedProcs]   = useState<string[]>(
      existing?.lead_procedures?.map(lp => lp.procedure_id) ?? [],
    )
    const [stageId, setStageId] = useState(
      existing?.crm_stage_id ?? initialStageId ?? stages[0]?.id ?? '',
    )
    const [tags,      setTags]      = useState<string[]>(existing?.tags ?? [])

    /**
     * D11 da 9ª: o telefone do lead NOVO é de uma cliente? A janela pergunta
     * "É a mesma pessoa?" junto ao telefone, assim que ele fica completo (o
     * inverso do cadastro, `pessoaDoCrmDoTelefone`). "Sim" liga a oportunidade
     * à ficha; o servidor confere de novo (`createLead`).
     */
    const [fichasDoFone, setFichasDoFone] = useState<{ telefone: string; fichas: { id: string; nome: string | null }[] } | null>(null)
    const [respostaDoFone, setRespostaDoFone] = useState<{ telefone: string; valor: string } | null>(null)
    const digitosDoFone = telefoneDoCadastro(phone)?.digitos ?? null
    const conferirFicha = !isEdit && !pessoa && !!digitosDoFone && digitosDoFone.length >= 10
    useEffect(() => {
      if (!conferirFicha || !digitosDoFone) return
      let vivo = true
      const t = setTimeout(() => {
        fichaDoTelefoneDoLead(digitosDoFone)
          .then(r => { if (vivo) setFichasDoFone({ telefone: digitosDoFone, fichas: r.fichas }) })
          .catch(() => { if (vivo) setFichasDoFone(null) })
      }, 300)
      return () => { vivo = false; clearTimeout(t) }
    }, [conferirFicha, digitosDoFone])
    const fichaDoFone = conferirFicha && fichasDoFone?.telefone === digitosDoFone ? fichasDoFone.fichas[0] ?? null : null
    const resposta = fichaDoFone && respostaDoFone?.telefone === digitosDoFone ? respostaDoFone.valor : ''
    const [faltaResponder, setFaltaResponder] = useState(false)

    // Levar o lead (já existente) a uma etapa de desfecho perdido pede o motivo
    // ali mesmo, como o quadro (2026-10-21). A lista só é buscada quando precisa.
    const vaiPerder = isEdit && stageId !== (existing?.crm_stage_id ?? '')
      && stages.find(s => s.id === stageId)?.outcome === 'LOST'
    const [motivos,  setMotivos]  = useState<OpcaoDeMotivo[] | null>(null)
    const [motivoId, setMotivoId] = useState('')
    const [motivoObs, setMotivoObs] = useState('')
    useEffect(() => {
      if (!vaiPerder || motivos) return
      let vivo = true
      listarMotivosDePerda().then(l => { if (vivo) setMotivos(l) }).catch(() => { if (vivo) setMotivos([]) })
      return () => { vivo = false }
    }, [vaiPerder, motivos])
    const [tagDraft,  setTagDraft]  = useState('')

    /**
     * O RESPONSÁVEL. A lista (e se quem abriu pode trocar) vem do servidor ao
     * abrir — o quadro monta um modal por card, e buscar na montagem seria uma
     * consulta por lead. Quem não pode trocar vê só o nome.
     */
    const [responsaveis, setResponsaveis] = useState<Responsaveis | null>(null)
    const [ownerId,      setOwnerId]      = useState(existing?.owner_id ?? '')
    const idResponsavel = useId()
    const idNome        = useId()
    const idOrigem      = useId()
    const idEtapa       = useId()
    const idObservacoes = useId()


    /**
     * O `<dialog>` fica no DOM mesmo fechado, e o quadro monta um por card.
     * Sem este controle, tudo que vive dentro dele roda 20 vezes ao abrir o
     * CRM — o histórico disparava uma consulta por lead da tela. Além do custo,
     * carregar na montagem deixava a linha do tempo velha: arrastar o card e
     * abrir em seguida mostrava o estado anterior ao arraste.
     */
    const [aberto, setAberto] = useState(false)

    /**
     * Sugestões de tag: as da rede (Configurações → Tags — lidas só ao abrir:
     * o quadro monta um modal por card) e as unidades. As ORIGENS saíram
     * (J-17, 2026-10-30): repetiam o campo Origem logo acima, e a mesma coisa
     * virava tag e origem ao mesmo tempo.
     *
     * A unidade é uma tag como outra qualquer — não é dona do lead e não decide
     * quem o enxerga. Ela existe como sugestão só para não virar texto digitado
     * à mão ("Unidade: centro" minúsculo não casa com a métrica por unidade).
     * Quem decide de quem é o lead são as pessoas, pela tag e pelo dono; a
     * distribuição automática fica para as automações.
     */
    const vocabulario = useTagsDaRede(aberto)
    // A14 da 7ª simulação: as origens são da clínica (Configurar funis); sem
    // a lista (carregando, falhou), as de sempre.
    const origensDaClinica = useOrigensDaRede(aberto)
    const origens = origensDaClinica?.length ? origensDaClinica : LEAD_SOURCES.map(x => x.key)
    // Controlada: a lista chega depois de abrir, e o select sem dono perdia a
    // escolha quando as opções mudavam.
    const [origem, setOrigem] = useState(existing?.source ?? '')
    /** Origem gravada que não está na lista da clínica (desativada, base legada). */
    const origemForaDaLista = origem && !origens.includes(origem) ? origem : null
    const suggestedTags = useMemo(() => [...new Set([
      ...(vocabulario ?? []),
      ...(unidades ?? []).map(u => unitTag(u.name)),
    ])], [unidades, vocabulario])

    const networkMode = !!branches && branches.length > 0
    // Sem filial no lead, o portal da rede não tem slug de unidade para
    // revalidar; a action revalida /admin/oportunidades de qualquer jeito.
    const activeBranchSlug = networkMode ? '' : (slug ?? '')

    // --- Ir para a conversa ---------------------------------------
    // Declarados antes de `open`, que zera o erro ao abrir.
    const [abrindoConversa, setAbrindoConversa] = useState(false)
    const [erroConversa,    setErroConversa]    = useState<string | null>(null)

    const open = useCallback(() => {
      setPhone(telefoneDoCampo(existing?.phone ?? pessoa?.telefone))
      setSelectedProcs(existing?.lead_procedures?.map(lp => lp.procedure_id) ?? [])
      setStageId(existing?.crm_stage_id ?? initialStageId ?? stages[0]?.id ?? '')
      setOrigem(existing?.source ?? '')
      setMotivoId(''); setMotivoObs('')
      // Lead novo no portal da unidade já nasce marcado com ela — quem cria
      // ali está trabalhando aquela unidade.
      const tagsIniciais = existing?.tags
        ?? (branchName ? [unitTag(branchName)] : [])
      setTags(tagsIniciais)
      setTagDraft('')
      setErroConversa(null)
      setOwnerId(existing?.owner_id ?? '')
      setAberto(true)
      dialogRef.current?.showModal()
      responsaveisParaOportunidade()
        .then(r => {
          setResponsaveis(r)
          // Lead novo nasce de quem o cria (é o que o servidor faz sem o campo).
          if (!existing) setOwnerId(r.eu ?? '')
        })
        .catch(() => setResponsaveis(null))
    }, [existing, initialStageId, stages, branchName, pessoa])

    const close = useCallback(() => dialogRef.current?.close(), [])

    async function irParaConversa() {
      if (!existing) return
      setErroConversa(null)
      setAbrindoConversa(true)
      const res = await openLeadConversation(existing.id)
      setAbrindoConversa(false)
      if (!res.conversationId) {
        setErroConversa(res.error ?? 'Não foi possível abrir a conversa deste lead.')
        return
      }
      close()
      router.push(rotaInbox(pathname, slug, res.conversationId))
    }

    useImperativeHandle(ref, () => ({ open }), [open])

    // A15: a busca pediu outra pessoa com o quadro já aberto (a página não
    // remonta) — ajustado durante o render, como o `?lead=` do quadro.
    const [pessoaPedida, setPessoaPedida] = useState(novoDaPessoa?.id ?? null)
    if (!existing && (novoDaPessoa?.id ?? null) !== pessoaPedida) {
      setPessoaPedida(novoDaPessoa?.id ?? null)
      if (novoDaPessoa) setPessoa(novoDaPessoa)
    }
    // Veio com a pessoa: abre sozinho e tira o `?contato=` da URL (recarregar não reabre).
    const abrirComAPessoa = useEffectEvent(() => {
      open()
      const params = new URLSearchParams(window.location.search)
      if (!params.has('contato')) return
      params.delete('contato')
      const resto = params.toString()
      window.history.replaceState(null, '', `${window.location.pathname}${resto ? `?${resto}` : ''}`)
    })
    // Depois da montagem (o <dialog> já no DOM), fora do corpo do efeito.
    useEffect(() => {
      if (!pessoa) return
      const t = setTimeout(abrirComAPessoa, 0)
      return () => clearTimeout(t)
    }, [pessoa])

    const aoSalvar = useEffectEvent(() => {
      if (!state?.success) return
      close()
      if (!isEdit && 'leadId' in state && onLeadCreated) {
        const campo = (nome: string) => String(enviado.current?.get(nome) ?? '').trim()
        const newLead: Lead = {
          id:           state.leadId as string,
          name:         campo('name'),
          phone:        phone || null,
          email:        campo('email') || null,
          social_media: campo('social_media') || null,
          source:       campo('source') || null,
          notes:        campo('notes') || null,
          crm_stage_id: stageId || null,
          client_id:    /^mesma:/.test(campo('_fichaDoTelefone')) ? campo('_fichaDoTelefone').slice(7) : null,
          created_at:   (state as { createdAt?: string }).createdAt ?? new Date().toISOString(),
          tags,
          retornar_em:  campo('retornar_em') || null,
          retornar_obs: campo('retornar_em') ? campo('retornar_obs') || null : null,
          lead_procedures: selectedProcs.map(pid => ({
            procedure_id: pid,
            procedures:   procedures.find(p => p.id === pid)
              ? { name: procedures.find(p => p.id === pid)!.name, price: 0 }
              : null,
          })),
        }
        onLeadCreated(newLead)
      } else {
        router.refresh()
      }
    })
    useEffect(() => { if (state?.success) aoSalvar() }, [state])

    function toggleProc(id: string) {
      setSelectedProcs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    function addTag(raw: string) {
      const value = raw.trim()
      if (!value) return
      setTags(prev => prev.includes(value) ? prev : [...prev, value])
      setTagDraft('')
    }

    function toggleTag(value: string) {
      setTags(prev => prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value])
    }

    function removeTag(value: string) {
      setTags(prev => prev.filter(t => t !== value))
    }

    return (
      <>
        {trigger && (
          <span onClick={open} style={{ cursor: 'pointer', display: 'contents' }}>
            {trigger}
          </span>
        )}

        <dialog
          ref={dialogRef}
          className="modal"
          // Um lugar só para Esc, clique no fundo e botão de fechar.
          onClose={() => { setAberto(false); setPessoa(null) }}
          onClick={e => { if (e.target === dialogRef.current) close() }}
        >
          {/* Header */}
          <div style={{
            position: 'sticky', top: 0, zIndex: 1,
            background: 'var(--surface)', borderBottom: '1px solid var(--hairline)',
            padding: '18px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>
                {isEdit ? 'Editar lead' : 'Novo lead'}
              </h2>
              <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                {isEdit ? existing!.name : 'Adicionar contato ao funil de CRM'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {/* Simétrico ao painel do inbox, que linka de volta para
                  Oportunidades. A conversa é criada na hora se ainda não
                  existir — é o mesmo caminho que o card usava antes. */}
              {isEdit && (
                <button
                  type="button"
                  onClick={irParaConversa}
                  disabled={abrindoConversa}
                  title="Abrir a conversa deste lead no Inbox"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '7px 12px', borderRadius: 10, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--bg-app)',
                    color: 'var(--brand)', fontSize: 'var(--text-sm-sz)', fontWeight: 700,
                    fontFamily: 'inherit', whiteSpace: 'nowrap',
                    opacity: abrindoConversa ? 0.6 : 1,
                  }}
                >
                  <MessageSquare size={13} />
                  {abrindoConversa ? 'Abrindo…' : 'Ir para a conversa'}
                </button>
              )}
              {/* A16: o card agenda como o painel do inbox — a ficha nasce
                  com o nome e o telefone do lead e fica ligada a ele. */}
              {isEdit && agendar && agendar.unidades.length > 0 && (
                <button type="button" className="btn-secondary"
                  onClick={() => { close(); setAgendando(true) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  <CalendarPlus size={13} /> Agendar
                </button>
              )}

              <button type="button" onClick={close} style={{
                width: 32, height: 32, borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--bg-app)',
                color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0,
              }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {erroConversa && (
            <p style={{
              padding: '10px 24px 0', fontSize: 'var(--text-sm-sz)',
              color: 'var(--warning)', fontWeight: 700,
            }}>
              {erroConversa}
            </p>
          )}

          {/* Body */}
          <div style={{ padding: '24px 24px 28px' }}>
            <form key={pessoa?.id ?? 'novo'} action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
              onSubmit={e => {
                // D11: sem a resposta do "É a mesma pessoa?", não envia (o envio limparia o formulário) e diz o que falta.
                if (fichaDoFone && !resposta) { e.preventDefault(); setFaltaResponder(true) } else setFaltaResponder(false)
              }}>
              {pessoa && <input type="hidden" name="_contatoId" value={pessoa.id} />}
              <input type="hidden" name="_funnelId"     value={funnelId ?? ''} />
              <input type="hidden" name="_slug"         value={activeBranchSlug} />
              <input type="hidden" name="procedure_ids" value={JSON.stringify(selectedProcs)} />
              <input type="hidden" name="tags" value={JSON.stringify(tags)} />
              {isEdit && <input type="hidden" name="_leadId" value={existing!.id} />}


              {/* Nome */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label htmlFor={idNome}>Nome *</Label>
                <input id={idNome} name="name" type="text" required className="field"
                  defaultValue={existing?.name ?? pessoa?.nome} placeholder="Nome do contato" />
              </div>

              {/* Contato */}
              <div>
                <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 4 }}>
                  CONTATO <span style={{ color: 'var(--brand)' }}>*</span>
                </p>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 10 }}>
                  Preencha pelo menos um dos campos abaixo
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', minWidth: 80 }}>Telefone</span>
                    <input name="phone" type="tel" className="field" style={{ flex: 1 }}
                      aria-label="Telefone"
                      value={phone} onChange={e => setPhone(maskTelefoneDigitando(e.target.value))}
                      placeholder="(00) 00000-0000" />
                  </div>
                  {fichaDoFone && (
                    <div data-ficha-do-telefone role="group" aria-label="É a mesma pessoa?" style={{
                      background: 'var(--info-soft)', border: '1px solid var(--border)', borderRadius: 10,
                      padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
                    }}>
                      <input type="hidden" name="_fichaDoTelefone" value={resposta} />
                      <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 600 }}>
                        Este telefone é {fichaDoFone.nome ? <>da ficha de <strong>{fichaDoFone.nome}</strong></> : 'de uma cliente da clínica'}. É a mesma pessoa?
                      </p>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {([
                          [`mesma:${fichaDoFone.id}`, 'Sim, é ela', 'a oportunidade nasce ligada à ficha'],
                          ['outra', 'Não, é outra pessoa', 'a oportunidade nasce sem ficha'],
                        ] as const).map(([valor, rotulo, dica]) => (
                          <button key={valor} type="button" title={dica} aria-pressed={resposta === valor}
                            className={resposta === valor ? 'btn-primary' : 'btn-secondary'}
                            onClick={() => digitosDoFone && setRespostaDoFone({ telefone: digitosDoFone, valor })}>
                            {resposta === valor && <Check size={13} />} {rotulo}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', minWidth: 80 }}>E-mail</span>
                    <input name="email" type="email" className="field" style={{ flex: 1 }} aria-label="E-mail"
                      defaultValue={existing?.email ?? pessoa?.email ?? ''} placeholder="contato@email.com" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', minWidth: 80 }}>Rede social</span>
                    <input name="social_media" type="text" className="field" style={{ flex: 1 }} aria-label="Rede social"
                      defaultValue={existing?.social_media ?? ''} placeholder="@usuario ou link do perfil" />
                  </div>
                </div>
              </div>

              {/* Procedimentos */}
              <div>
                <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 10 }}>
                  PROCEDIMENTOS DE INTERESSE
                </p>
                {procedures.length === 0 ? (
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)', padding: '4px 0' }}>
                    Nenhum procedimento cadastrado. Acesse o portal admin para cadastrar.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 140, overflowY: 'auto', padding: '2px 0' }}>
                      {procedures.map(p => {
                        const selected = selectedProcs.includes(p.id)
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className={selected ? 'chip-filtro is-ativo' : 'chip-filtro'}
                            aria-pressed={selected}
                            onClick={() => toggleProc(p.id)}
                          >
                            {selected && <Check size={11} strokeWidth={3} />}
                            {p.name}
                          </button>
                        )
                      })}
                    </div>
                    {selectedProcs.length > 0 && (
                      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 6 }}>
                        {selectedProcs.length} selecionado{selectedProcs.length > 1 ? 's' : ''}
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Origem + Etapa */}
              <div className="form-2col">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={idOrigem}>Origem</Label>
                  <select id={idOrigem} name="source" className="field" value={origem} onChange={e => setOrigem(e.target.value)}>
                    <option value="">Não informado</option>
                    {/*
                      Origem fora da lista canônica vira opção própria. As chaves
                      são "Instagram"/"WhatsApp", mas existe base com
                      "instagram"/"whatsapp" minúsculo: sem esta opção o select
                      não casava, caía em "Não informado" e **salvar apagava a
                      origem do lead em silêncio**.
                    */}
                    {origemForaDaLista && (
                      <option value={origemForaDaLista}>{origemForaDaLista}</option>
                    )}
                    {origens.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label htmlFor={idEtapa}>Etapa</Label>
                  <select id={idEtapa} name="crm_stage_id" className="field"
                    value={stageId} onChange={e => setStageId(e.target.value)}>
                    <StageOptions funnels={funnels ?? []} stages={stages} />
                  </select>
                </div>
              </div>

              {vaiPerder && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <MotivoDaPerdaCampos motivos={motivos ?? []} motivoId={motivoId} obs={motivoObs}
                    onMotivo={setMotivoId} onObs={setMotivoObs} lembrete
                    nomes={{ motivo: 'motivo_perda_id', obs: 'motivo_perda_obs' }} />
                </div>
              )}

              {/* Responsável */}
              {responsaveis?.pode ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label htmlFor={idResponsavel} style={{
                    fontSize: 'var(--text-xs-sz)', fontWeight: 700,
                    color: 'var(--text-muted)', letterSpacing: '0.04em',
                  }}>
                    Responsável
                  </label>
                  <select id={idResponsavel} name="owner_id" className="field"
                    value={ownerId} onChange={e => setOwnerId(e.target.value)}>
                    <option value="">Sem responsável</option>
                    {/* Responsável que saiu da lista (desativado) segue como
                        opção: salvar sem mexer não pode tirá-lo em silêncio. */}
                    {existing?.owner_id && !responsaveis.pessoas.some(p => p.id === existing.owner_id) && (
                      <option value={existing.owner_id}>{existing.owner_name ?? 'Pessoa desativada'}</option>
                    )}
                    {responsaveis.pessoas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              ) : isEdit && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <Label>Responsável</Label>
                  <p style={{ fontSize: 'var(--text-sm-sz)', color: existing?.owner_name ? 'var(--text)' : 'var(--text-faint)' }}>
                    {existing?.owner_name ?? 'Sem responsável'}
                  </p>
                </div>
              )}

              {/* Tags */}
              <div>
                <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 4 }}>
                  TAGS
                </p>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginBottom: 10 }}>
                  Classifique o lead (origem manual, filial, campanha…)
                </p>

                {/* Tags selecionadas */}
                {tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {tags.map(t => (
                      <TagBadge key={t} label={t} size="sm" onRemove={() => removeTag(t)} />
                    ))}
                  </div>
                )}

                {/* Entrada de tag livre */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="text"
                    className="field"
                    style={{ flex: 1 }}
                    value={tagDraft}
                    onChange={e => setTagDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addTag(tagDraft) }
                    }}
                    placeholder="Digite uma tag e Enter"
                  />
                  <button
                    type="button"
                    onClick={() => addTag(tagDraft)}
                    disabled={!tagDraft.trim()}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 'var(--text-sm-sz)', fontWeight: 700, padding: '7px 12px', borderRadius: 10,
                      border: '1.5px solid var(--border)', background: 'var(--bg-app)',
                      color: 'var(--text-muted)', cursor: tagDraft.trim() ? 'pointer' : 'default',
                      opacity: tagDraft.trim() ? 1 : 0.5, flexShrink: 0,
                    }}
                  >
                    <Plus size={13} /> Adicionar
                  </button>
                </div>

                {/* Sugestões rápidas */}
                {suggestedTags.some(s => !tags.includes(s)) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {suggestedTags.filter(s => !tags.includes(s)).map(s => (
                      <button key={s} type="button" onClick={() => toggleTag(s)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: 'var(--text-sm-sz)', fontWeight: 600, padding: '5px 10px', borderRadius: 99, cursor: 'pointer',
                        border: '1.5px dashed var(--border)', background: 'var(--surface)',
                        color: 'var(--text-muted)', transition: 'all 120ms',
                      }}>
                        <Plus size={11} strokeWidth={3} />
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Observações */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <Label htmlFor={idObservacoes}>Observações</Label>
                <textarea id={idObservacoes} name="notes" rows={3} className="field"
                  defaultValue={existing?.notes ?? ''}
                  placeholder="Interesse, contexto, próximos passos…"
                  style={{ resize: 'vertical' }} />
              </div>

              {/* A42 da 9ª: o lembrete de retorno. No dia, quem tem o lead é
                  avisado no sino — o card não anda sozinho (princípio 6). */}
              <div data-lembrete-de-retorno style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                  LEMBRETE DE RETORNO
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '0 0 170px' }}>
                    <span className="field-label">Retornar em</span>
                    <input name="retornar_em" type="date" className="field" defaultValue={existing?.retornar_em ?? ''} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: '1 1 220px' }}>
                    <span className="field-label">O que fazer no retorno</span>
                    <input name="retornar_obs" type="text" className="field" maxLength={200}
                      defaultValue={existing?.retornar_obs ?? ''} placeholder="Ex.: ligar para falar do orçamento" />
                  </label>
                </div>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>
                  No dia, quem é o responsável pelo lead recebe o lembrete no sino. O card não muda de etapa sozinho.
                </p>
              </div>

              {/* Histórico — só na edição: card que ainda não existe não tem
                  passado, e a consulta seria por um id inexistente. */}
              {isEdit && aberto && (
                <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
                  <LeadTimeline leadId={existing!.id} />
                </div>
              )}

              {/* Feedback */}
              {faltaResponder && fichaDoFone && !resposta && (
                <p data-falta-responder style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 700 }}>
                  Responda antes de criar: este telefone é {fichaDoFone.nome ? `da ficha de ${fichaDoFone.nome}` : 'de uma cliente da clínica'}. É a mesma pessoa? (logo abaixo do telefone)
                </p>
              )}
              {state?.error && (
                <p style={{ color: 'var(--warning)', background: 'var(--warning-soft)', borderRadius: 8, padding: '8px 12px', fontSize: 'var(--text-xs-sz)', fontWeight: 700 }}>
                  {state.error}
                </p>
              )}
              {state?.success && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success)', fontSize: 'var(--text-xs-sz)', fontWeight: 700 }}>
                  <CheckCircle2 size={14} />
                  {isEdit ? 'Lead atualizado.' : 'Lead criado com sucesso.'}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button type="button" onClick={close} className="btn-secondary" disabled={pending}>
                  Cancelar
                </button>
                <button type="submit" disabled={pending} className="btn-primary">
                  <UserPlus size={15} />
                  {pending ? (isEdit ? 'Salvando…' : 'Criando…') : (isEdit ? 'Salvar' : 'Criar lead')}
                </button>
              </div>
            </form>
          </div>
        </dialog>

        {agendando && existing && agendar && (
          <ScheduleModal
            leadId={existing.id}
            conversationId={null}
            clienteLigado={agendar.clienteId ? existing.name : null}
            clienteId={agendar.clienteId}
            contatoInicial={{ nome: existing.name, telefone: telefoneDoCampo(existing.phone) }}
            branches={agendar.unidades}
            onClose={() => setAgendando(false)}
            onScheduled={() => { setAgendando(false); router.refresh() }}
          />
        )}
      </>
    )
  },
)
