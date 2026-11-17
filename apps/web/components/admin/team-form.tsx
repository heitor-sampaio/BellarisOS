'use client'

import { useActionState, useEffect, useState } from 'react'
import { SEM_MINHAS_COMISSOES_NO_CADASTRO } from '@/lib/permissions-copy'
import { Plus, X } from 'lucide-react'
import { createTeamMember } from '@/actions/team'
import { JanelaModal } from '@/components/shared/janela-modal'
import { UnidadesDoMembro, AtendeDoMembro, useAtendeDoMembro, type ValorDasUnidades } from '@/components/shared/unidades-do-membro'
import { toast } from 'sonner'
import { confirmacaoDoCadastro } from '@/lib/equipe/textos-do-cadastro'
import { Dica } from '@/components/shared/dica'

interface Branch { id: string; name: string }
/** O rótulo do campo com a dica ao lado (a explicação mora na dica, 2026-11-16). */
const rotuloComDica = { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' } as const
/** C62 (F70): o porquê do cargo desligado (o mesmo texto da recusa da action, `lib/equipe/cargo-acima.ts`). */
const DICA_DO_CARGO_ACIMA_TEXTO = 'Só quem tem esses módulos pode dar este cargo.'

interface Role   {
  id: string; label: string
  /** C62 (F70): o cargo tem mais acesso que o de quem age — aparece desligado. */
  acimaDoMeu?: boolean
  /** A18 da 17ª: o cargo não mostra as próprias comissões (sem o Financeiro), com as comissões no plano. */
  naoVeAsComissoes?: boolean
}

interface AdminTeamFormProps {
  branches:       Branch[]
  roles:          Role[]
  isNetworkAdmin: boolean
  /** `financial: MANAGE` com comissões no plano: quem atende já nasce com o percentual padrão. */
  podeComissao?:  boolean
  /**
   * O cargo de sistema Admin, quando quem cadastra É Admin (eq-01, revisão do
   * Heitor de 2026-11-02: "oferecer no cadastro; o caminho em dois passos não
   * protege nada"). Escolhido, a abrangência não se pergunta: a Admin é da
   * clínica toda (o servidor grava assim, peça o formulário o que pedir).
   */
  cargoDeAdminId?: string | null
}

export function AdminTeamForm(props: AdminTeamFormProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Adicionar membro
      </button>
      {open && <NovoMembro {...props} onFechar={() => setOpen(false)} />}
    </>
  )
}

/**
 * O formulário só existe com a janela aberta: todo o estado (atende,
 * abrangência, o resultado da última tentativa) nasce limpo a cada abertura.
 * Até 2026-10-28 ele vivia FORA do modal e o cadastro seguinte herdava o
 * "Atende clientes" e a abrangência do anterior — o Marcos (Financeiro) nasceu
 * profissional (D8, regressão de 4e5bef5).
 */
function NovoMembro({ branches, roles, isNetworkAdmin, podeComissao = false, cargoDeAdminId = null, onFechar }: AdminTeamFormProps & { onFechar: () => void }) {
  // As unidades (EQ1a): a rede inteira, ou as marcadas. Uma unidade só: já vem marcada (F8).
  const [unidades, setUnidades] = useState<ValorDasUnidades>(branches.length === 1 ? [branches[0]!.id] : [])
  const [roleId, setRoleId] = useState('')
  // A21 da 18ª: o nome, para o "deu certo" dizer quem entrou.
  const [nome, setNome] = useState('')
  const ehAdmin = !!cargoDeAdminId && roleId === cargoDeAdminId
  // O "Atende" de UMA caixa (EQ1c): vale nas unidades dela.
  const unidadesDela = ehAdmin || unidades === 'rede' ? branches.map(b => b.id) : unidades
  const atendeEstado = useAtendeDoMembro([], unidadesDela)
  const atende = atendeEstado.efetivo.length > 0
  const [state, action, pending] = useActionState(createTeamMember, undefined)
  const stateError = state && 'error' in state ? state.error : null

  // Fecha quando chega o resultado de sucesso.
  const sucesso = !!(state && 'success' in state && state.success)
  // A3 da 8ª: quem atende e entrou sem comissão fica sabendo onde se define.
  const avisoDoCadastro = state && 'aviso' in state ? state.aviso : null
  // A21 da 18ª (princípio 3): criar o membro confirma sempre — antes, o toast
  // só saía com o aviso da comissão, e o formulário fechava calado.
  useEffect(() => {
    if (!sucesso) return
    toast.success(confirmacaoDoCadastro(nome), avisoDoCadastro ? { description: avisoDoCadastro } : undefined)
    onFechar()
  }, [sucesso, avisoDoCadastro, onFechar, nome])

  return (
    <>
      {(
        <JanelaModal onFechar={onFechar} rotulo="Novo membro da equipe" largura={460} fechaNoFundo={false}>
          <div style={{ padding: 'var(--card-pad)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
                  Novo membro da equipe
                </h2>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                  A senha temporária deve ser trocada no primeiro acesso.
                </p>
              </div>
              <button className="btn-ghost" onClick={onFechar} style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <input type="hidden" name="redirectPath" value="/admin/team" />

              <div className="form-2col">
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-name">Nome completo</label>
                  <input id="tm-name" name="name" type="text" required className="field" placeholder="Ex: Ana Souza" value={nome} onChange={e => setNome(e.target.value)} />
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-email">E-mail</label>
                  <input id="tm-email" name="email" type="email" required className="field" placeholder="ana@bellaris.com" />
                </div>
                {/* A13 da 12ª (princípio 1): o CRM/COREN, opcional. */}
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={rotuloComDica}>
                    <label className="overline" htmlFor="tm-registro">Registro no conselho (opcional)</label>
                    <Dica rotulo="Sobre o registro no conselho">Sai nos documentos pela variável do registro de quem atende.</Dica>
                  </span>
                  <input id="tm-registro" name="registro_conselho" type="text" maxLength={60} className="field" placeholder="Ex.: CRM-SC 12345, COREN-SC 123456" />
                </div>

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={rotuloComDica}>
                    <label className="overline" htmlFor="tm-role">Cargo</label>
                    {/* O porquê do cargo desligado (C62) e o da abrangência que some com a
                        Admin da rede (eq-01): explicação, mora na dica (2026-11-16). */}
                    {(ehAdmin || roles.some(r => r.acimaDoMeu)) && (
                      <Dica rotulo="Sobre a escolha do acesso">
                        {ehAdmin && <span data-dica-admin-da-rede style={{ display: 'block' }}>A Admin tem acesso à rede toda, em todas as unidades, e pode dar e alterar o cargo de Admin.</span>}
                        {roles.some(r => r.acimaDoMeu) && <span style={{ display: 'block', marginTop: ehAdmin ? 6 : 0 }}>{DICA_DO_CARGO_ACIMA_TEXTO}</span>}
                      </Dica>
                    )}
                  </span>
                  <select id="tm-role" name="roleId" required className="field" value={roleId} onChange={e => setRoleId(e.target.value)}>
                    <option value="" disabled>Selecione…</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id} disabled={r.acimaDoMeu}>
                        {r.acimaDoMeu ? `${r.label} (tem módulos que você não tem)` : r.label}
                      </option>
                    ))}
                  </select>
                  {roles.length === 0 && (
                    <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                      Crie um cargo em Configurações → Cargos antes de adicionar membros.
                    </span>
                  )}
                </div>

                {/* Abrangência — a Admin é sempre da rede toda (o porquê, na dica do Cargo). */}
                {!ehAdmin && (
                  <UnidadesDoMembro id="tm-unidades" unidades={branches} editaveis={isNetworkAdmin ? null : branches.map(b => b.id)}
                    valor={unidades} aoMudar={setUnidades} />
                )}

                {/* Atende clientes (EQ1c): uma caixa; "Escolher em quais unidades atende" abre a lista. */}
                <AtendeDoMembro id="tm-atende" estado={atendeEstado} unidades={branches} unidadesDela={unidadesDela} />

                {/* A18 da 17ª: quem atende num cargo sem o Financeiro não verá as próprias comissões. */}
                {atende && roles.find(r => r.id === roleId)?.naoVeAsComissoes && (
                  <span data-sem-minhas-comissoes style={{ gridColumn: '1 / -1', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    {SEM_MINHAS_COMISSOES_NO_CADASTRO}
                  </span>
                )}

                {atende && podeComissao && (
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <span style={rotuloComDica}>
                      <label className="overline" htmlFor="tm-comissao">Comissão padrão (%)</label>
                      <Dica rotulo="Sobre a comissão padrão">
                        Percentual sobre cada atendimento da pessoa. Deixe em branco para definir depois — e as exceções por procedimento ficam no chip de comissão da lista.
                      </Dica>
                    </span>
                    <input id="tm-comissao" name="comissao_padrao" type="text" inputMode="decimal" className="field" placeholder="Ex: 30" />
                  </div>
                )}

                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-password">Senha temporária</label>
                  <input id="tm-password" name="password" type="password" required minLength={8} className="field" placeholder="Mín. 8 caracteres" />
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
                  {pending ? 'Criando…' : 'Criar membro'}
                </button>
              </div>
            </form>
          </div>
        </JanelaModal>
      )}
    </>
  )
}
