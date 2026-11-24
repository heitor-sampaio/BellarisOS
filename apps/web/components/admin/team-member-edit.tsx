'use client'

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { EditorDeHorario } from '@/components/shared/editor-de-horario'
import { normalizarHorario, horarioDeQuemDeixaDeSeguir } from '@/lib/agenda/horario'
import { Pencil, X } from 'lucide-react'
import { updateTeamMember } from '@/actions/team'
import { JanelaModal } from '@/components/shared/janela-modal'
import { useFala } from '@/components/shared/uma-unidade'
import { UnidadesDoMembro, AtendeDoMembro, useAtendeDoMembro, type ValorDasUnidades } from '@/components/shared/unidades-do-membro'
import { RepasseDoAtende, repasseDasEscolhas } from '@/components/admin/repasse-do-atende'
import { Dica } from '@/components/shared/dica'
import { textoDoRelogioDoHorario } from '@/lib/unidades/hora-da-unidade'
import { toast } from 'sonner'
import { MEMBRO_SEM_ACESSO, MEMBRO_SEM_ACESSO_QUE_ATENDE } from '@/lib/cargos/sem-acesso'

interface Branch { id: string; name: string; /** O horário de funcionamento (J-9: de onde parte o do membro). */ horario?: unknown }
/** C62 (F70): o porquê do cargo desligado (o mesmo texto da recusa da action, `lib/equipe/cargo-acima.ts`). */
const DICA_DO_CARGO_ACIMA_TEXTO = 'Só quem tem esses módulos pode dar este cargo.'

interface Role   {
  id: string; label: string
  /** C62 (F70): o cargo tem mais acesso que o de quem age — aparece desligado. */
  acimaDoMeu?: boolean
  /** Item 21 de 18/11: o cargo não abre módulo nenhum (o "Não definido", ou todo em Sem acesso). */
  semAcesso?: boolean
}

export interface EditableMember {
  id:               string
  name:             string
  email:            string
  roleId:           string | null
  branchId:         string | null
  /** As outras unidades dela, além da principal (`branchId`) — EQ1a. */
  outrasUnidades?:  string[]
  providesServices: boolean
  /** As unidades em que atende (o checklist do "Atende", decisão 2 da 8ª). */
  atendeEm?:        string[]
  /** O horário de atendimento (nulo = segue a unidade). */
  horario?:         unknown
  /** O registro no conselho (CRM, COREN…), opcional — A13 da 12ª. */
  registroConselho?: string | null
}

interface Props {
  member:         EditableMember
  branches:       Branch[]
  roles:          Role[]
  /** Quem tem a rede inteira: dá "A rede inteira" e marca qualquer unidade. */
  canChooseScope: boolean
  /**
   * As unidades de quem edita, quando não tem a rede inteira (EQ1a): com mais
   * de uma, ela marca entre as DELA. Com uma só, o campo não aparece e as
   * unidades do membro ficam como estão.
   */
  unidadesDeQuemEdita?: string[] | null
  redirectPath:   string
  /**
   * O cargo de SISTEMA do membro (o Admin da rede), travado: é a Admin editando
   * a si mesma (D2, 2026-10-29; revisto pelo Heitor no mesmo dia — outra Admin
   * troca, ela não). Aparece travado, e a abrangência também. Sem isto o
   * seletor recebia um valor fora das opções e o navegador marcava o primeiro
   * cargo da lista — salvar o "atende" rebaixava a dona da clínica.
   */
  cargoFixo?:     Role
  /**
   * O cargo do membro fica como está, e a dica diz por quê (PLAT-03 da
   * varredura de 18/11): ele tem uma unidade fora do alcance de quem edita, e
   * o cargo vale em todas (EQ1). A action recusaria a troca; as unidades e o
   * "atende" seguem editáveis.
   */
  cargoTravado?:  string
  /**
   * O id do cargo de sistema Admin da rede, quando ele está entre as opções
   * (só a Admin da rede o dá — revisão do Heitor, 2026-10-29). Escolhido, a
   * abrangência some: a Admin é sempre da rede.
   */
  cargoDeAdminId?: string
  /** As unidades do checklist do "Atende" (todas as ativas da rede); sem isto, `branches`. */
  unidadesDoAtende?: { id: string; name: string }[]
  /** As que quem edita pode marcar ou desmarcar (a gerente de unidade fixa: só a dela); null = todas. */
  editaveisDoAtende?: string[] | null
  /**
   * A11 da 26ª: o fuso de cada unidade (o id → o fuso). O horário próprio é da
   * parede e vale no relógio de cada unidade em que a pessoa atende; a tela diz
   * qual, fora do de Brasília (princípio 3). Não muda como o horário é lido.
   */
  fusos?: Record<string, string>
}

/**
 * Edição de membro já cadastrado: cargo, abrangência e a flag de profissional.
 *
 * A action `updateTeamMember` existia desde a migração de cargos dinâmicos e
 * nunca teve tela — sem isso não havia como trocar o cargo de ninguém, o que
 * deixava o modelo de permissões inoperante na prática.
 */
export function TeamMemberEdit(props: Props) {
  const { member } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen(true)}
        style={{ padding: '5px 8px', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)', whiteSpace: 'nowrap' }}
        title={`Editar ${member.name}`}
        aria-label={`Editar ${member.name}`}
      >
        {/* A6 da 14ª (princípio 7): o lápis sozinho não dizia o que se edita. */}
        <Pencil size={15} aria-hidden /> Cargo e unidade
      </button>

      {open && <EdicaoDoMembro {...props} onFechar={() => setOpen(false)} />}
    </>
  )
}

/**
 * O formulário só existe com a janela aberta (D8, 2026-10-28): a abrangência e
 * o resultado da última tentativa nascem dos valores do membro a cada abertura,
 * e não do que se mexeu antes de cancelar.
 */
function EdicaoDoMembro({ member, branches, roles, canChooseScope, unidadesDeQuemEdita = null, redirectPath, cargoFixo, cargoTravado, cargoDeAdminId, unidadesDoAtende, editaveisDoAtende = null, fusos = {}, onFechar }: Props & { onFechar: () => void }) {
  // As unidades (EQ1a): a rede inteira, ou as dela (a principal primeiro).
  const [unidadesEscolhidas, setUnidades] = useState<ValorDasUnidades>(
    member.branchId ? [member.branchId, ...(member.outrasUnidades ?? []).filter(u => u !== member.branchId)] : 'rede')
  const fala = useFala()
  // Cargo fora das opções nunca vira "o primeiro da lista": fica em "Selecione…".
  const cargoInicial = member.roleId && roles.some(r => r.id === member.roleId) ? member.roleId : ''
  const [cargo, setCargo] = useState(cargoInicial)
  // A Admin da rede é sempre da rede: escolhido o cargo, a abrangência some.
  const paraAdmin = !!cargoDeAdminId && cargo === cargoDeAdminId
  const unidades: ValorDasUnidades = paraAdmin ? 'rede' : unidadesEscolhidas
  // O campo "Unidades": quem tem a rede inteira, ou quem tem mais de uma unidade.
  const mostraUnidades = !cargoFixo && !paraAdmin && (canChooseScope || (unidadesDeQuemEdita?.length ?? 0) > 1)
  const todasAsAtivas = unidadesDoAtende ?? branches
  const unidadesDela = unidades === 'rede' ? todasAsAtivas.map(b => b.id) : unidades
  const [state, action, pending] = useActionState(updateTeamMember, undefined)
  const stateError = state && 'error' in state ? state.error : null
  // A10: rebaixar uma Admin pergunta antes (o servidor também — sem o "sim",
  // devolve a pergunta). O "atende" é controlado: o React 19 limpa o campo
  // solto do formulário depois de cada envio, e a resposta reenvia.
  const pergunta = state && 'pergunta' in state ? state.pergunta : null
  const [rebaixar, setRebaixar] = useState(false)
  // O "Atende" de UMA caixa (EQ1c): fechada, vale nas unidades dela.
  const atendeEstado = useAtendeDoMembro(member.atendeEm ?? [], unidadesDela)
  const atendeEm = atendeEstado.efetivo
  // A11 da 26ª: o relógio do horário — o das unidades em que ela atende (sem nenhuma, as dela).
  const relogioDoHorario = textoDoRelogioDoHorario(
    todasAsAtivas.filter(b => (atendeEm.length ? atendeEm : unidadesDela).includes(b.id)).map(b => ({ nome: b.name, fuso: fusos[b.id] })),
  )
  const formRef = useRef<HTMLFormElement>(null)
  // D3 da 9ª: desmarcar a unidade com agendamentos ali devolve o repasse. Ele
  // vale para o "Atende" que foi enviado — mexeu de novo, some (e o servidor pergunta de novo).
  const repasse = state && 'repasseDoAtende' in state ? state.repasseDoAtende : null
  const [atendeEnviado, setAtendeEnviado] = useState<string | null>(null)
  const [escolhas, setEscolhas] = useState<Record<string, string>>({})
  const [responderRepasse, setResponderRepasse] = useState(false)
  const repasseVale = !!repasse && atendeEnviado === atendeEm.join(',')
  const escolheuAlgum = Object.values(escolhas).some(Boolean)

  // Fecha quando chega o resultado de sucesso.
  const sucesso = !!(state && 'success' in state && state.success)
  // Item 21 de 18/11: salvo com um cargo que não abre nada, a confirmação avisa (não recusa).
  const avisoAoSalvar = state && 'aviso' in state ? state.aviso ?? null : null
  useEffect(() => {
    if (!sucesso) return
    if (avisoAoSalvar) toast.warning(avisoAoSalvar)
    onFechar()
  }, [sucesso, avisoAoSalvar, onFechar])
  // O cargo que fica (o escolhido, ou o travado) não abre nada: a janela diz, à vista.
  const cargoQueFica = cargoFixo ? null : cargoTravado ? member.roleId : cargo
  const ficaSemAcesso = !!cargoQueFica && !!roles.find(r => r.id === cargoQueFica)?.semAcesso

  return (
    <>
      {(
        <JanelaModal onFechar={onFechar} rotulo={`Editar ${member.name}`} largura={460} fechaNoFundo={false}>
          <div style={{ padding: 'var(--card-pad)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
                  {member.name}
                </h2>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {member.email}
                </p>
              </div>
              <button type="button" className="btn-ghost" onClick={onFechar} style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            {/* Pelo onSubmit, e não por <form action> (D9 da 13ª, F70): o React limpa o formulário
                depois de cada envio por action, e a resposta a uma pergunta (rebaixar, repasse)
                reenviava o campo solto com o valor do começo — o registro no conselho digitado
                voltava ao de antes. */}
            <form ref={formRef} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              onSubmit={e => {
                e.preventDefault()
                setAtendeEnviado(atendeEm.join(','))
                const dados = new FormData(e.currentTarget)
                startTransition(() => action(dados))
              }}>
              <input type="hidden" name="_repasseDoAtende" value={repasseVale && responderRepasse ? JSON.stringify(repasseDasEscolhas(escolhas)) : ''} />
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="_rebaixarAdmin" value={rebaixar ? 'sim' : ''} />
              <input type="hidden" name="redirectPath" value={redirectPath} />

              <div className="form-2col">
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {/* O porquê do cargo travado, do cargo desligado (C62), o "vale no próximo
                      carregamento" e o acesso da Admin da rede moram na dica (2026-11-16). */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
                    <label className="overline" htmlFor={`tme-role-${member.id}`}>Cargo</label>
                    <Dica rotulo="Sobre a escolha do acesso">
                      {cargoFixo ? (
                        <span style={{ display: 'block' }}>Você não muda o próprio cargo de {cargoFixo.label}: {fala('outra Admin da rede muda.')}</span>
                      ) : cargoTravado ? (
                        <span data-cargo-travado style={{ display: 'block' }}>{cargoTravado}</span>
                      ) : (
                        <>
                          {roles.some(r => r.acimaDoMeu && r.id !== member.roleId) && (
                            <span style={{ display: 'block', marginBottom: 6 }}>{DICA_DO_CARGO_ACIMA_TEXTO}</span>
                          )}
                          {paraAdmin && (
                            <span style={{ display: 'block', marginBottom: 6 }}>{fala('A Admin da rede tem acesso total, em todas as unidades.')}</span>
                          )}
                          <span style={{ display: 'block' }}>A troca de cargo vale no próximo carregamento — não é preciso sair e entrar.</span>
                        </>
                      )}
                    </Dica>
                  </span>
                  {cargoFixo ? (
                    <>
                      {/* O select desabilitado não vai no formulário: o cargo segue no oculto. */}
                      <input type="hidden" name="roleId" value={cargoFixo.id} />
                      <select id={`tme-role-${member.id}`} className="field" value={cargoFixo.id} disabled>
                        <option value={cargoFixo.id}>{cargoFixo.label}</option>
                      </select>
                    </>
                  ) : cargoTravado ? (
                    <>
                      {/* O select desabilitado não vai no formulário: o cargo segue no oculto. */}
                      <input type="hidden" name="roleId" value={member.roleId ?? ''} />
                      <select id={`tme-role-${member.id}`} className="field" value={member.roleId ?? ''} disabled>
                        <option value={member.roleId ?? ''}>{roles.find(r => r.id === member.roleId)?.label ?? '—'}</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <select
                        id={`tme-role-${member.id}`} name="roleId" required className="field"
                        value={cargo} onChange={e => setCargo(e.target.value)}
                      >
                        <option value="" disabled>Selecione…</option>
                        {roles.map(r => (
                          // O cargo que ela JÁ TEM fica escolhível: manter não é dar (C62).
                          <option key={r.id} value={r.id} disabled={r.acimaDoMeu && r.id !== member.roleId}>
                            {r.acimaDoMeu && r.id !== member.roleId ? `${r.label} (tem módulos que você não tem)` : r.semAcesso ? `${r.label} (sem acesso)` : r.label}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                  {ficaSemAcesso && (
                    <p data-cargo-sem-acesso role="status" style={{
                      color: 'var(--warning)', background: 'var(--warning-soft)',
                      borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
                      fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
                    }}>
                      {MEMBRO_SEM_ACESSO}
                      {atendeEm.length > 0 && <> {MEMBRO_SEM_ACESSO_QUE_ATENDE}</>}
                    </p>
                  )}
                </div>

                {mostraUnidades && (
                  <UnidadesDoMembro id={`tme-unidades-${member.id}`}
                    // Quem edita vê as dela; a unidade do membro fora do alcance aparece travada.
                    unidades={canChooseScope ? branches : todasAsAtivas.filter(b => (unidadesDeQuemEdita ?? []).includes(b.id) || unidadesDela.includes(b.id))}
                    editaveis={canChooseScope ? null : unidadesDeQuemEdita}
                    valor={unidades} aoMudar={setUnidades} principalDeAntes={member.branchId} />
                )}

                {/* O "Atende" de UMA caixa (EQ1c): marcada, atende em todas as unidades dela. */}
                <AtendeDoMembro id={`tme-atende-${member.id}`} estado={atendeEstado} unidades={todasAsAtivas}
                  unidadesDela={unidadesDela} editaveis={editaveisDoAtende} />

                {/* A13 da 12ª (princípio 1): o CRM/COREN, opcional — a variável do registro nos documentos. */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor={`tme-registro-${member.id}`}>Registro no conselho (opcional)</label>
                  <input id={`tme-registro-${member.id}`} name="registro_conselho" type="text" maxLength={60} className="field"
                    defaultValue={member.registroConselho ?? ''} placeholder="Ex.: CRM-SC 12345, COREN-SC 123456" />
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="field-label">Horário de atendimento</span>
                  {relogioDoHorario && (
                    <p data-relogio-do-horario style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>{relogioDoHorario}</p>
                  )}
                  <EditorDeHorario nome="horario" valor={normalizarHorario(member.horario)} seguir="Segue o horário da unidade"
                    base={horarioDeQuemDeixaDeSeguir(branches, unidades === 'rede' ? null : (unidades[0] ?? null))} />
                </div>
              </div>

              {stateError && (
                <p style={{
                  color: 'var(--warning)', background: 'var(--warning-soft)',
                  borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
                  fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
                }}>
                  {stateError}
                </p>
              )}

              {pergunta && !rebaixar && cargo !== cargoInicial && (
                <div role="alert" data-rebaixar-admin style={{
                  display: 'flex', flexDirection: 'column', gap: 10,
                  color: 'var(--warning)', background: 'var(--warning-soft)',
                  borderRadius: 'var(--radius-field-token)', padding: '10px 12px',
                  fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
                }}>
                  <span>{pergunta}</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn-primary" disabled={pending}
                      onClick={() => { flushSync(() => setRebaixar(true)); formRef.current?.requestSubmit() }}>
                      Trocar o cargo mesmo assim
                    </button>
                    <button type="button" className="btn-secondary" disabled={pending}
                      onClick={() => setCargo(cargoInicial)}>
                      Manter como Admin
                    </button>
                  </div>
                </div>
              )}

              {repasseVale && repasse && <RepasseDoAtende dados={repasse} escolhas={escolhas} aoEscolher={setEscolhas} />}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
                {repasseVale ? (
                  <button type="button" disabled={pending} className="btn-primary"
                    onClick={() => { flushSync(() => setResponderRepasse(true)); formRef.current?.requestSubmit() }}>
                    {pending ? 'Salvando…' : escolheuAlgum ? 'Salvar e repassar' : 'Salvar sem repassar'}
                  </button>
                ) : (
                  <button type="submit" disabled={pending} className="btn-primary" onClick={() => setResponderRepasse(false)}>
                    {pending ? 'Salvando…' : 'Salvar'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </JanelaModal>
      )}
    </>
  )
}
