'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { EditorDeHorario } from '@/components/shared/editor-de-horario'
import { normalizarHorario, horarioDeQuemDeixaDeSeguir } from '@/lib/agenda/horario'
import { Pencil, X } from 'lucide-react'
import { updateTeamMember } from '@/actions/team'
import { SegSelect } from '@/components/shared/seg-select'
import { JanelaModal } from '@/components/shared/janela-modal'
import { useFala } from '@/components/shared/uma-unidade'
import { AtendeNasUnidades } from '@/components/shared/atende-nas-unidades'
import { RepasseDoAtende, repasseDasEscolhas } from '@/components/admin/repasse-do-atende'

interface Branch { id: string; name: string; /** O horário de funcionamento (J-9: de onde parte o do membro). */ horario?: unknown }
interface Role   { id: string; label: string }

export interface EditableMember {
  id:               string
  name:             string
  email:            string
  roleId:           string | null
  branchId:         string | null
  providesServices: boolean
  /** As unidades em que atende (o checklist do "Atende", decisão 2 da 8ª). */
  atendeEm?:        string[]
  /** O horário de atendimento (nulo = segue a unidade). */
  horario?:         unknown
}

interface Props {
  member:         EditableMember
  branches:       Branch[]
  roles:          Role[]
  /** Só quem tem abrangência de rede escolhe entre filial e rede. */
  canChooseScope: boolean
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
   * O id do cargo de sistema Admin da rede, quando ele está entre as opções
   * (só a Admin da rede o dá — revisão do Heitor, 2026-10-29). Escolhido, a
   * abrangência some: a Admin é sempre da rede.
   */
  cargoDeAdminId?: string
  /** As unidades do checklist do "Atende" (todas as ativas da rede); sem isto, `branches`. */
  unidadesDoAtende?: { id: string; name: string }[]
  /** As que quem edita pode marcar ou desmarcar (a gerente de unidade fixa: só a dela); null = todas. */
  editaveisDoAtende?: string[] | null
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
        style={{ padding: '5px 8px', color: 'var(--brand)' }}
        title={`Editar ${member.name}`}
      >
        <Pencil size={15} />
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
function EdicaoDoMembro({ member, branches, roles, canChooseScope, redirectPath, cargoFixo, cargoDeAdminId, unidadesDoAtende, editaveisDoAtende = null, onFechar }: Props & { onFechar: () => void }) {
  const [scopeEscolhido, setScope] = useState<'branch' | 'network'>(member.branchId ? 'branch' : 'network')
  // Uma unidade só: já vem escolhida (F8).
  const [filial, setFilial] = useState(member.branchId ?? (branches.length === 1 ? branches[0]!.id : ''))
  const fala = useFala()
  // Cargo fora das opções nunca vira "o primeiro da lista": fica em "Selecione…".
  const cargoInicial = member.roleId && roles.some(r => r.id === member.roleId) ? member.roleId : ''
  const [cargo, setCargo] = useState(cargoInicial)
  // A Admin da rede é sempre da rede: escolhido o cargo, a abrangência some.
  const paraAdmin = !!cargoDeAdminId && cargo === cargoDeAdminId
  const scope = paraAdmin ? 'network' : scopeEscolhido
  const [state, action, pending] = useActionState(updateTeamMember, undefined)
  const stateError = state && 'error' in state ? state.error : null
  // A10: rebaixar uma Admin pergunta antes (o servidor também — sem o "sim",
  // devolve a pergunta). O "atende" é controlado: o React 19 limpa o campo
  // solto do formulário depois de cada envio, e a resposta reenvia.
  const pergunta = state && 'pergunta' in state ? state.pergunta : null
  const [rebaixar, setRebaixar] = useState(false)
  const [atendeEm, setAtendeEm] = useState<string[]>(member.atendeEm ?? [])
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
  useEffect(() => { if (sucesso) onFechar() }, [sucesso, onFechar])

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

            <form ref={formRef} action={action} onSubmit={() => setAtendeEnviado(atendeEm.join(','))} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input type="hidden" name="_repasseDoAtende" value={repasseVale && responderRepasse ? JSON.stringify(repasseDasEscolhas(escolhas)) : ''} />
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="_rebaixarAdmin" value={rebaixar ? 'sim' : ''} />
              <input type="hidden" name="redirectPath" value={redirectPath} />
              <input type="hidden" name="scope" value={scope} />

              <div className="form-2col">
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor={`tme-role-${member.id}`}>Cargo</label>
                  {cargoFixo ? (
                    <>
                      {/* O select desabilitado não vai no formulário: o cargo segue no oculto. */}
                      <input type="hidden" name="roleId" value={cargoFixo.id} />
                      <select id={`tme-role-${member.id}`} className="field" value={cargoFixo.id} disabled>
                        <option value={cargoFixo.id}>{cargoFixo.label}</option>
                      </select>
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                        Você não muda o próprio cargo de {cargoFixo.label}: {fala('outra Admin da rede muda.')}
                      </span>
                    </>
                  ) : (
                    <>
                      <select
                        id={`tme-role-${member.id}`} name="roleId" required className="field"
                        value={cargo} onChange={e => setCargo(e.target.value)}
                      >
                        <option value="" disabled>Selecione…</option>
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                      <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                        A troca de cargo vale no próximo carregamento — não é preciso sair e entrar.
                      </span>
                    </>
                  )}
                </div>

                {!cargoFixo && !paraAdmin && canChooseScope && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline">Abrangência</label>
                    <SegSelect
                      options={[
                        { key: 'branch',  label: 'Uma unidade' },
                        { key: 'network', label: fala('Rede inteira') },
                      ]}
                      value={scope}
                      onSelect={k => setScope(k as 'branch' | 'network')}
                      ariaLabel="Abrangência do membro"
                    />
                  </div>
                )}

                {!cargoFixo && scope === 'branch' && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline" htmlFor={`tme-branch-${member.id}`}>Unidade</label>
                    <select
                      id={`tme-branch-${member.id}`} name="branchId" required className="field"
                      value={filial} onChange={e => setFilial(e.target.value)}
                    >
                      <option value="" disabled>Selecione…</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!cargoFixo && scope === 'network' && (
                  <span style={{ gridColumn: '1 / -1', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    {paraAdmin ? fala('A Admin da rede tem acesso total, em todas as unidades.') : 'Acesso a todas as unidades, sem unidade fixa.'}
                  </span>
                )}

                <AtendeNasUnidades id={`tme-atende-${member.id}`} unidades={unidadesDoAtende ?? branches}
                  marcadas={atendeEm} aoMudar={setAtendeEm} editaveis={editaveisDoAtende} />

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="field-label">Horário de atendimento</span>
                  <EditorDeHorario nome="horario" valor={normalizarHorario(member.horario)} seguir="Segue o horário da unidade"
                    base={horarioDeQuemDeixaDeSeguir(branches, scope === 'branch' ? (filial || null) : null)} />
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
