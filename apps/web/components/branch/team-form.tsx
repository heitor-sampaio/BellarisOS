'use client'

import { useActionState, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { createTeamMember } from '@/actions/team'
import { JanelaModal } from '@/components/shared/janela-modal'
import { AtendeNasUnidades } from '@/components/shared/atende-nas-unidades'
import { toast } from 'sonner'

interface Role { id: string; label: string }

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
}

export function TeamForm({ branchId, slug, roles, unidade = null, unidadesDoAtende, editaveisDoAtende = null, podeComissao = false }: TeamFormProps) {
  const [open, setOpen] = useState(false)
  const [atendeEm, setAtendeEm] = useState<string[]>([])
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
      <button className="btn-primary" onClick={() => { setAtendeEm([]); setOpen(true) }}>
        <Plus size={15} />
        Adicionar membro
      </button>

      {open && (
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
              <input type="hidden" name="scope" value="branch" />
              <input type="hidden" name="branchId" value={branchId} />
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
                <label className="overline" htmlFor="tm-registro">Registro no conselho (opcional)</label>
                <input id="tm-registro" name="registro_conselho" type="text" maxLength={60} className="field" placeholder="Ex.: CRM-SC 12345, COREN-SC 123456" />
                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)' }}>Sai nos termos e contratos pela variável do registro da profissional.</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label className="overline" htmlFor="tm-role">Cargo</label>
                <select id="tm-role" name="roleId" required className="field" defaultValue="">
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

              <AtendeNasUnidades id="tm-atende" unidades={unidadesDoAtende ?? [{ id: branchId, name: unidade ?? 'Esta unidade' }]}
                marcadas={atendeEm} aoMudar={setAtendeEm} editaveis={editaveisDoAtende} />

              {/* A3 da 8ª simulação: o cadastro da unidade não pedia a comissão. */}
              {atendeEm.length > 0 && podeComissao && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label className="overline" htmlFor="tm-comissao">Comissão padrão (%)</label>
                  <input id="tm-comissao" name="comissao_padrao" type="text" inputMode="decimal" className="field" placeholder="Ex: 30" />
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                    Percentual sobre cada atendimento dela. Deixe em branco para definir depois — e as exceções por procedimento ficam no chip de comissão da lista.
                  </span>
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
