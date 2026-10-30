'use client'

import { useActionState, useEffect, useState } from 'react'
import { EditorDeHorario } from '@/components/shared/editor-de-horario'
import { normalizarHorario, horarioDeQuemDeixaDeSeguir } from '@/lib/agenda/horario'
import { Pencil, X } from 'lucide-react'
import { updateTeamMember } from '@/actions/team'
import { SegSelect } from '@/components/shared/seg-select'
import { JanelaModal } from '@/components/shared/janela-modal'

interface Branch { id: string; name: string; /** O horário de funcionamento (J-9: de onde parte o do membro). */ horario?: unknown }
interface Role   { id: string; label: string }

export interface EditableMember {
  id:               string
  name:             string
  email:            string
  roleId:           string | null
  branchId:         string | null
  providesServices: boolean
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
function EdicaoDoMembro({ member, branches, roles, canChooseScope, redirectPath, cargoFixo, cargoDeAdminId, onFechar }: Props & { onFechar: () => void }) {
  const [scopeEscolhido, setScope] = useState<'branch' | 'network'>(member.branchId ? 'branch' : 'network')
  const [filial, setFilial] = useState(member.branchId ?? '')
  // Cargo fora das opções nunca vira "o primeiro da lista": fica em "Selecione…".
  const cargoInicial = member.roleId && roles.some(r => r.id === member.roleId) ? member.roleId : ''
  const [cargo, setCargo] = useState(cargoInicial)
  // A Admin da rede é sempre da rede: escolhido o cargo, a abrangência some.
  const paraAdmin = !!cargoDeAdminId && cargo === cargoDeAdminId
  const scope = paraAdmin ? 'network' : scopeEscolhido
  const [state, action, pending] = useActionState(updateTeamMember, undefined)
  const stateError = state && 'error' in state ? state.error : null

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

            <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input type="hidden" name="userId" value={member.id} />
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
                        Você não muda o próprio cargo de {cargoFixo.label}: outra Admin da rede muda.
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
                        { key: 'branch',  label: 'Uma filial' },
                        { key: 'network', label: 'Rede inteira' },
                      ]}
                      value={scope}
                      onSelect={k => setScope(k as 'branch' | 'network')}
                      ariaLabel="Abrangência do membro"
                    />
                  </div>
                )}

                {!cargoFixo && scope === 'branch' && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label className="overline" htmlFor={`tme-branch-${member.id}`}>Filial</label>
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
                    {paraAdmin ? 'A Admin da rede tem acesso total, em todas as unidades.' : 'Acesso a todas as unidades, sem filial fixa.'}
                  </span>
                )}

                <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox" name="providesServices"
                    defaultChecked={member.providesServices}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                  />
                  <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)' }}>
                    Atende clientes (aparece na agenda como profissional e gera comissão)
                  </span>
                </label>

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

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
                <button type="submit" disabled={pending} className="btn-primary">
                  {pending ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </JanelaModal>
      )}
    </>
  )
}
