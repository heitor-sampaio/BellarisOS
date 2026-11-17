'use client'

import { useActionState, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createTeamMember } from '@/actions/team'
import { JanelaModal } from '@/components/shared/janela-modal'
import { UnidadesDoMembro, AtendeDoMembro, useAtendeDoMembro, type ValorDasUnidades } from '@/components/shared/unidades-do-membro'
import { toast } from 'sonner'
import { SEM_MINHAS_COMISSOES_NO_CADASTRO } from '@/lib/permissions-copy'
import { Dica } from '@/components/shared/dica'

/** O rótulo do campo com a dica ao lado (a explicação mora na dica, 2026-11-16). */
const rotuloComDica = { display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' } as const

interface Role {
  id: string; label: string
  /** A18 da 17ª: o cargo não mostra as próprias comissões (sem o Financeiro), com as comissões no plano. */
  naoVeAsComissoes?: boolean
}

interface TeamFormProps {
  branchId: string
  slug:     string
  roles:    Role[]
  /** A unidade em que a pessoa entra (A13: a gerente não via onde). */
  unidade?: string | null
  /** As unidades do checklist do "Atende" (decisão 2 da 8ª); sem isto, só esta. */
  unidadesDoAtende?: { id: string; name: string }[]
  /** As que quem cadastra marca (a gerente de unidade fixa: só a dela); null = todas. */
  editaveisDoAtende?: string[] | null
  /** `financial: MANAGE` com comissões no plano: quem atende já nasce com a comissão padrão (A3 da 8ª). */
  podeComissao?: boolean
  /**
   * As unidades de quem cadastra, quando são MAIS de uma (EQ1a): ela marca em
   * quais das dela a pessoa nova entra (começa nesta). Sem isto, entra nesta.
   */
  unidadesDeQuemCadastra?: { id: string; name: string }[] | null
}

export function TeamForm(props: TeamFormProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} />
        Adicionar membro
      </button>
      {open && <NovoMembroDaUnidade {...props} onFechar={() => setOpen(false)} />}
    </>
  )
}

/** O formulário só existe com a janela aberta: o estado nasce limpo a cada abertura (D8). */
function NovoMembroDaUnidade({ branchId, slug, roles, unidade = null, unidadesDoAtende, editaveisDoAtende = null, podeComissao = false, unidadesDeQuemCadastra = null, onFechar }: TeamFormProps & { onFechar: () => void }) {
  const setOpen = (aberto: boolean) => { if (!aberto) onFechar() }
  const variasMinhas = (unidadesDeQuemCadastra?.length ?? 0) > 1
  const [unidades, setUnidades] = useState<ValorDasUnidades>([branchId])
  const unidadesDela = variasMinhas && Array.isArray(unidades) ? unidades : [branchId]
  // O "Atende" de UMA caixa (EQ1c): vale nas unidades dela.
  const atendeEstado = useAtendeDoMembro([], unidadesDela)
  const atendeEm = atendeEstado.efetivo
  const [roleId, setRoleId] = useState('')
  // O sucesso fecha o formulário na própria action, quando a resposta chega.
  const [state, action, pending] = useActionState(
    async (anterior: Parameters<typeof createTeamMember>[0], dados: FormData) => {
      const r = await createTeamMember(anterior, dados)
      if (r && 'success' in r && r.success) {
        // A3 da 8ª: quem atende e entrou sem comissão fica sabendo onde se define.
        if ('aviso' in r && r.aviso) toast(r.aviso)
        setOpen(false)
      }
      return r
    },
    undefined,
  )
  const stateError = state && 'error' in state ? state.error : null

  return (
    <>
      {(
        <JanelaModal onFechar={() => setOpen(false)} rotulo="Novo membro" largura={440} fechaNoFundo={false}>
          <div style={{ padding: 'var(--card-pad)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
                  Novo membro
                </h2>
                <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 2 }}>
                  {unidade ? <>Entra na unidade <b style={{ color: 'var(--text)' }}>{unidade}</b>. </> : null}A senha temporária deve ser trocada no primeiro acesso.
                </p>
              </div>
              <button className="btn-ghost" onClick={() => setOpen(false)} style={{ padding: 6 }}>
                <X size={16} />
              </button>
            </div>

            <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {!variasMinhas && (
                <>
                  <input type="hidden" name="scope" value="branch" />
                  <input type="hidden" name="branchId" value={branchId} />
                </>
              )}
              <input type="hidden" name="redirectPath" value={slug} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="overline" htmlFor="tm-name">Nome completo</label>
                <input id="tm-name" name="name" type="text" required className="field" placeholder="Ex: Ana Souza" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="overline" htmlFor="tm-email">E-mail</label>
                <input id="tm-email" name="email" type="email" required className="field" placeholder="ana@bellaris.com" />
              </div>

              {/* A13 da 12ª (princípio 1): o CRM/COREN, opcional. */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={rotuloComDica}>
                  <label className="overline" htmlFor="tm-registro">Registro no conselho (opcional)</label>
                  <Dica rotulo="Sobre o registro no conselho">Sai nos documentos pela variável do registro de quem atende.</Dica>
                </span>
                <input id="tm-registro" name="registro_conselho" type="text" maxLength={60} className="field" placeholder="Ex.: CRM-SC 12345, COREN-SC 123456" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="overline" htmlFor="tm-role">Cargo</label>
                <select id="tm-role" name="roleId" required className="field" value={roleId} onChange={e => setRoleId(e.target.value)}>
                  <option value="" disabled>Selecione…</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
                {roles.length === 0 && (
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    Nenhum cargo disponível. Peça ao admin da rede para criar cargos.
                  </span>
                )}
              </div>

              {variasMinhas && (
                <UnidadesDoMembro id="tm-unidades" unidades={unidadesDeQuemCadastra!} editaveis={unidadesDeQuemCadastra!.map(u => u.id)}
                  valor={unidades} aoMudar={setUnidades} />
              )}

              <AtendeDoMembro id="tm-atende" estado={atendeEstado}
                unidades={unidadesDoAtende ?? [{ id: branchId, name: unidade ?? 'Esta unidade' }]}
                unidadesDela={unidadesDela} editaveis={editaveisDoAtende} />

              {/* A18 da 17ª: quem atende num cargo sem o Financeiro não verá as próprias comissões. */}
              {atendeEm.length > 0 && roles.find(r => r.id === roleId)?.naoVeAsComissoes && (
                <span data-sem-minhas-comissoes style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                  {SEM_MINHAS_COMISSOES_NO_CADASTRO}
                </span>
              )}

              {/* A3 da 8ª simulação: o cadastro da unidade não pedia a comissão. */}
              {/* A4 da 22ª (princípio 7): à vista, desligado até marcar onde atende. */}
              {podeComissao && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={rotuloComDica}>
                    <label className="overline" htmlFor="tm-comissao">Comissão padrão (%)</label>
                    <Dica rotulo="Sobre a comissão padrão">
                      Percentual sobre cada atendimento da pessoa. Deixe em branco para definir depois — e as exceções por procedimento ficam no chip de comissão da lista.
                    </Dica>
                  </span>
                  <input id="tm-comissao" name="comissao_padrao" type="text" inputMode="decimal" className="field" disabled={atendeEm.length === 0}
                    placeholder={atendeEm.length > 0 ? 'Ex: 30' : 'Marque “Atende clientes” para definir'} />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="overline" htmlFor="tm-password">Senha temporária</label>
                <input id="tm-password" name="password" type="password" required minLength={8} className="field" placeholder="Mín. 8 caracteres" />
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
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancelar</button>
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
