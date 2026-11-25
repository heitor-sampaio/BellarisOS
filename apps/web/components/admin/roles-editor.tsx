'use client'

import React, { useActionState, useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react'
import { Plus, Lock, Trash2, Pencil, Check, X, CheckCircle2, AlertTriangle, Users, Copy } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createRole, updateRole, deleteRole, duplicarCargo } from '@/actions/roles'
import { saveRolePermissions } from '@/actions/permissions'
import { cargoEscolhido, comOsCriados } from '@/lib/cargos/cargo-escolhido'
import { acessosDoSalvo, resumoDoCargo } from '@/lib/cargos/acessos-salvos'
import {
  ALL_MODULES, MODULOS_DO_CARGO, MODULE_LABELS, MODULE_HINTS, MODULE_LEVELS, LEVEL_LABELS,
  ALL_REPORT_TABS, REPORT_TAB_LABELS, REPORT_TAB_HINTS, abasQueValem, motivoDaAbaFechada, nivelAceito,
} from '@/lib/permissions'
import {
  MODULE_GROUPS, LEVEL_COPY, notaDoResumoDaRede,
  NETWORK_ONLY, notaDeAbrangencia, SO_NA_REDE_NOTE, quemVendeNoResumo, copilotNoResumo, textoDoQueFaltaNoCargo, documentosNoResumo,
  tratamentosNoResumo, conclusaoNoResumo, vistasPessoaisNoResumo, prontuarioSemClientesNoResumo,
} from '@/lib/permissions-copy'
import { ADMIN_MENU, BRANCH_MENU, menuLabelsFor, soLeriaAsConfiguracoes } from '@/lib/menu'
import { rotuloDasAbasAlcancadas, ABAS_DA_REDE, ABAS_DA_UNIDADE } from '@/lib/configuracoes/abas'
import { OPCOES_DE_CAIXAS, lerCaixas, type CaixasDoCargo } from '@/lib/inbox/visibilidade'
import { SegSelect } from '@/components/shared/seg-select'
import { Fala } from '@/components/shared/uma-unidade'
import { Dica } from '@/components/shared/dica'
import type {
  AppModule, PermissionLevel, ResolvedPermissions, ReportTab,
} from '@estetica-os/types'
import { resumoDoCargoDeSistema, explicacaoDoCargoDeSistema } from '@/lib/cargos/de-sistema'
import { cargoSemAcesso, CARGO_SEM_ACESSO, type PlanoDoCargo } from '@/lib/cargos/sem-acesso'

export interface EditorRole {
  id:           string
  key:          string
  label:        string
  is_system:    boolean
  memberCount?: number
  /** Quais caixas de WhatsApp o cargo enxerga no inbox. */
  inboxCaixas:  CaixasDoCargo
}

/** O que um cargo tem em um módulo: até onde mexe (nível). */
export interface RoleModulePermission {
  level: PermissionLevel
}

interface RolesEditorProps {
  roles:       EditorRole[]
  permsByRole: Record<string, Partial<Record<AppModule, RoleModulePermission>>>
  /** Abas de Relatórios por cargo. Cargo ausente = nenhuma aba, sem relatório. */
  tabsByRole:  Record<string, ReportTab[]>
  /** Cargos e Equipe são módulos diferentes: sem `team`, o atalho não é link. */
  canSeeTeam:  boolean
  /** Módulos que o PLANO da rede não inclui: a matriz não os oferece (lib/planos/recursos.ts). */
  foraDoPlano?: AppModule[]
  /** As abas de Relatórios fora do plano: sem outra, Relatórios não abre nada (item 21 de 18/11). */
  abasForaDoPlano?: string[]
}

/**
 * O cargo da rede que não abre módulo nenhum, pela mesma conta do contexto
 * (item 21 de 18/11; `lib/cargos/sem-acesso.ts`).
 */
function semAcessoNaMatriz(perms: Partial<Record<AppModule, RoleModulePermission>>, tabs: readonly string[], plano: PlanoDoCargo): boolean {
  const linhas = Object.entries(perms).map(([module, p]) => ({ module, level: p?.level ?? 'NONE' }))
  return cargoSemAcesso({ linhas, abas: tabs }, plano)
}

type Levels = Record<AppModule, PermissionLevel>

function buildLevels(perms: Partial<Record<AppModule, RoleModulePermission>>): Levels {
  // O módulo só da Admin da rede (a Auditoria) não é do cargo: fica em Sem acesso.
  // O nível gravado que o módulo não oferece mais aparece como o que vale (o
  // Gerenciar das Automações e do Marketing é "Ver", revisão de 24/11).
  return Object.fromEntries(ALL_MODULES.map(m => [m, MODULOS_DO_CARGO.includes(m) ? nivelAceito(m, perms[m]?.level ?? 'NONE') : 'NONE'])) as Levels
}

/**
 * O cargo escolhido no endereço (`?cargo=`, A18 da 20ª). D5 da 27ª: o criar e o
 * duplicar o escrevem ANTES do pedido, com o id do cargo novo — a tela que o
 * servidor devolve (e a que remonta) já abre nele.
 */
function escreverCargoNoEndereco(id: string | null) {
  const url = new URL(window.location.href)
  if (id) url.searchParams.set('cargo', id)
  else url.searchParams.delete('cargo')
  window.history.replaceState(null, '', url)
}

export function RolesEditor({ roles: cargosDoServidor, permsByRole, tabsByRole, canSeeTeam, foraDoPlano = [], abasForaDoPlano = [] }: RolesEditorProps) {
  // D5 da 27ª (princípio 3): o cargo que a action acabou de criar vale na lista
  // (e abre no editor) sem esperar a lista do servidor.
  const [criados, setCriados] = useState<EditorRole[]>([])
  const roles = comOsCriados(cargosDoServidor, criados)
  // A18 da 20ª (princípio 3): o escolhido mora no endereço (`?cargo=`) —
  // recarregada a tela, a matriz voltava ao primeiro cargo, e o recém-criado
  // ficava só na lista.
  const pedido = useSearchParams().get('cargo')
  const [selectedId, setSelectedIdNoEstado] = useState<string | null>(() => cargoEscolhido(roles, pedido))
  function setSelectedId(id: string | null) {
    setSelectedIdNoEstado(id)
    escreverCargoNoEndereco(id)
  }
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  // A1 da 13ª (F70): enquanto se dá nome ao cargo novo, o painel dizia "O que
  // Recepcionista acessa", com a matriz e o "Salvar acessos" do selecionado —
  // parecia que o novo nascia como cópia. Agora o painel diz como ele nasce.
  // A matriz do selecionado fica montada (escondida): o que foi mexido não se perde.
  const [criando, setCriando] = useState(false)

  const selected = roles.find(r => r.id === selectedId) ?? null

  // A17 da 21ª (princípio 3): o que a matriz acabou de salvar vale na lista e
  // ao voltar ao cargo — o cartão dizia "Nenhum acesso ainda" até recarregar.
  // Quando o servidor manda a lista de novo, ela é a que vale.
  const [salvos, setSalvos] = useState<Record<string, { perms: Partial<Record<AppModule, RoleModulePermission>>; tabs: ReportTab[] }>>({})
  const [doServidor, setDoServidor] = useState(permsByRole)
  if (doServidor !== permsByRole) { setDoServidor(permsByRole); setSalvos({}) }
  const permsDe = (id: string) => salvos[id]?.perms ?? permsByRole[id] ?? {}
  const permsDaLista = useMemo(
    () => ({ ...permsByRole, ...Object.fromEntries(Object.entries(salvos).map(([id, s]) => [id, s.perms])) }),
    [permsByRole, salvos],
  )

  // Item 21 de 18/11: a lista diz qual cargo da rede não abre nada (o salvo).
  const plano: PlanoDoCargo = { foraDoPlano, abasForaDoPlano }
  const semAcessoIds = new Set(roles
    .filter(r => !r.is_system && semAcessoNaMatriz(permsDaLista[r.id] ?? {}, salvos[r.id]?.tabs ?? tabsByRole[r.id] ?? [], plano))
    .map(r => r.id))

  // Trocar de cargo com alteração pendente descartava tudo em silêncio.
  function requestSelect(id: string) {
    if (id === selectedId) return
    if (dirty) { setPendingSelect(id); return }
    setSelectedId(id)
  }

  // D5 da 27ª: o cargo criado (ou a cópia) entra na lista e abre — a cópia com
  // os acessos do original, que a action copiou.
  function aoCriarCargo(role: EditorRole, copiaDe?: string) {
    setCriados(c => [...c.filter(r => r.id !== role.id), role])
    if (copiaDe) {
      setSalvos(s => ({ ...s, [role.id]: { perms: permsDe(copiaDe), tabs: salvos[copiaDe]?.tabs ?? tabsByRole[copiaDe] ?? [] } }))
    }
    requestSelect(role.id)
  }

  return (
    <div className="master-detail">
      <RoleListPanel
        roles={roles}
        selectedId={selectedId}
        permsByRole={permsDaLista}
        semAcessoIds={semAcessoIds}
        canSeeTeam={canSeeTeam}
        dirtyId={dirty ? selectedId : null}
        onSelect={requestSelect}
        onCriado={aoCriarCargo}
        showForm={criando}
        setShowForm={setCriando}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {criando && (
          <div className="card" data-cargo-novo style={{ background: 'var(--bg-app)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
              Cargo novo: começa sem acesso nenhum.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              {/* A4 da 24ª: o campo fica na lista de cargos (no celular, acima). */}
              Dê o nome na lista de cargos e clique em Criar. Depois, escolha aqui o que ele acessa.
            </p>
          </div>
        )}

        <div hidden={criando}>
        {selected?.is_system && <SystemRoleCard role={selected} />}

        {selected && !selected.is_system && (
          <PermissionMatrix
            key={selected.id}
            role={selected}
            perms={permsDe(selected.id)}
            tabs={salvos[selected.id]?.tabs ?? tabsByRole[selected.id] ?? []}
            onDirtyChange={setDirty}
            onSalvo={(levels, tabs) => setSalvos(s => ({
              ...s, [selected.id]: { perms: acessosDoSalvo(levels), tabs },
            }))}
            foraDoPlano={foraDoPlano}
            abasForaDoPlano={abasForaDoPlano}
          />
        )}

        {!selected && (
          <div className="card" style={{ background: 'var(--bg-app)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
              Crie um cargo ao lado para definir o que ele acessa.
            </p>
          </div>
        )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingSelect}
        title="Descartar alterações?"
        body="Você mexeu nos acessos deste cargo e ainda não salvou. Trocar de cargo agora descarta o que foi alterado."
        confirmLabel="Descartar e trocar"
        onConfirm={() => { setSelectedId(pendingSelect); setPendingSelect(null); setDirty(false) }}
        // O endereço volta ao cargo que segue aberto (o criar já o tinha trocado).
        onCancel={() => { setPendingSelect(null); escreverCargoNoEndereco(selectedId) }}
      />
    </div>
  )
}

// ─── Lista de cargos ─────────────────────────────────────────────────────────

function RoleListPanel({
  roles, selectedId, permsByRole, semAcessoIds, canSeeTeam, dirtyId, onSelect, onCriado, showForm, setShowForm,
}: {
  roles: EditorRole[]
  selectedId: string | null
  permsByRole: Record<string, Partial<Record<AppModule, RoleModulePermission>>>
  /** Os cargos da rede que não abrem módulo nenhum (item 21 de 18/11). */
  semAcessoIds: Set<string>
  canSeeTeam: boolean
  dirtyId: string | null
  onSelect: (id: string) => void
  /** O cargo que o criar ou o duplicar acabou de gravar (D5 da 27ª): entra na lista e abre. */
  onCriado: (role: EditorRole, copiaDe?: string) => void
  /** O formulário do cargo novo aberto (estado do pai: o painel da direita muda junto). */
  showForm: boolean
  setShowForm: (aberto: boolean) => void
}) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<EditorRole | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [createState, createAction, creating] = useActionState(createRole, undefined)

  // Só reage quando o resultado da action muda (não a cada render) — senão
  // reabrir o form seria fechado na hora enquanto createState.success persiste.
  // Fechar o form e selecionar o cargo novo são estado do PAI (A1 da 13ª: o
  // painel da direita muda junto): ficam no efeito, não no render.
  // D5 da 27ª (princípio 3): o id do cargo novo nasce aqui e vai ao endereço
  // no envio, antes do pedido — a tela que volta do servidor (e a que remonta
  // com ela) abre no cargo novo, não no primeiro editável. Um id a cada "Novo".
  const [novoId, setNovoId] = useState('')
  const aoCriar = useEffectEvent((role: { id: string; key: string; label: string } | null) => {
    setShowForm(false)
    if (role) onCriado({ ...role, is_system: false, memberCount: 0, inboxCaixas: lerCaixas(null) })
  })
  // Recusado: o endereço volta ao cargo que segue aberto.
  const aoRecusar = useEffectEvent(() => escreverCargoNoEndereco(selectedId))
  useEffect(() => {
    if (createState && 'success' in createState && createState.success) aoCriar(createState.role ?? null)
    else if (createState && 'error' in createState) aoRecusar()
  }, [createState])

  // A15 da 15ª: "Duplicar" — "Cópia de X" com a matriz e as abas; abre a cópia.
  function duplicar(role: EditorRole) {
    setError(null)
    const id = crypto.randomUUID()
    escreverCargoNoEndereco(id)
    startTransition(async () => {
      const res = await duplicarCargo(role.id, id)
      if ('error' in res) { setError(res.error); escreverCargoNoEndereco(selectedId); return }
      toast.success(`Cargo “${res.role.label}” criado.`)
      onCriado({ ...res.role, is_system: false, memberCount: 0, inboxCaixas: role.inboxCaixas }, role.id)
    })
  }

  function confirmDelete() {
    const role = toDelete
    if (!role) return
    setToDelete(null)
    setError(null)
    startTransition(async () => {
      const res = await deleteRole(role.id)
      if (res && 'error' in res) setError(res.error)
    })
  }

  // Sem `.clients-master-list`: aquela classe é sticky calculada a partir do
  // topbar, e aqui a lista vive dentro de uma aba, abaixo do título e da barra
  // de abas — grudaria no lugar errado. O empilhamento no mobile já vem do
  // `.master-detail`.
  return (
    <aside style={{ width: 268, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="overline">Cargos</span>
        {!showForm && (
          <button
            className="btn-ghost"
            onClick={() => { setNovoId(crypto.randomUUID()); setShowForm(true) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={13} /> Novo
          </button>
        )}
      </div>

      {showForm && (
        <form
          action={createAction}
          onSubmit={() => escreverCargoNoEndereco(novoId)}
          style={{
            padding: 12, background: 'var(--bg-app)',
            border: '1.5px solid var(--brand-soft-border)', borderRadius: 'var(--radius-card-sm)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <input type="hidden" name="id" value={novoId} />
          <input
            name="label" type="text" required autoFocus aria-label="Nome do cargo"
            className="field" placeholder="Ex.: Agenda e caixa"
            style={{ background: 'var(--surface)' }}
          />
          {createState && 'error' in createState && createState.error && (
            <p style={{ color: 'var(--warning)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)' }}>
              {createState.error}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="submit" disabled={creating} className="btn-primary" style={{ flex: 1 }}>
              {creating ? 'Criando…' : 'Criar'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {roles.map(role =>
        renaming === role.id ? (
          <RenameCard key={role.id} role={role} onDone={() => setRenaming(null)} />
        ) : (
          <RoleCard
            key={role.id}
            role={role}
            perms={permsByRole[role.id] ?? {}}
            semAcesso={semAcessoIds.has(role.id)}
            selected={role.id === selectedId}
            unsaved={role.id === dirtyId}
            canSeeTeam={canSeeTeam}
            deleting={pending}
            onSelect={() => onSelect(role.id)}
            onRename={() => setRenaming(role.id)}
            onDuplicate={() => duplicar(role)}
            onDelete={() => setToDelete(role)}
          />
        ),
      )}

      {error && (
        <p style={{ color: 'var(--warning)', fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)' }}>
          {error}
        </p>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title={`Excluir "${toDelete?.label ?? ''}"?`}
        body="O cargo sai da lista e não poderá mais ser atribuído. Se houver alguém com ele, a exclusão é recusada."
        confirmLabel="Excluir cargo"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </aside>
  )
}

function RoleCard({
  role, perms, semAcesso, selected, unsaved, canSeeTeam, deleting, onSelect, onRename, onDuplicate, onDelete,
}: {
  role: EditorRole
  perms: Partial<Record<AppModule, RoleModulePermission>>
  semAcesso: boolean
  selected: boolean
  unsaved: boolean
  canSeeTeam: boolean
  deleting: boolean
  onSelect: () => void
  onRename: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const count = role.memberCount ?? 0

  return (
    <div
      data-cargo={role.id}
      onClick={onSelect}
      style={{
        padding: '12px 14px', cursor: 'pointer',
        borderRadius: 'var(--radius-row)',
        // Registro selecionado usa realce suave; preenchimento sólido é do
        // elemento de marca, não de item de lista.
        background: selected ? 'var(--brand-soft)' : 'var(--surface)',
        border: `1.5px solid ${selected ? 'var(--brand-soft-border)' : 'var(--border)'}`,
        transition: 'background 120ms, border 120ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 'var(--text-sm-sz)',
          fontWeight: 'var(--weight-bold)', color: selected ? 'var(--brand)' : 'var(--text)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          <Fala>{role.label}</Fala>
        </span>
        {unsaved && (
          <span
            title="Alterações não salvas"
            style={{
              width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
              background: 'var(--brand)',
            }}
          />
        )}
        {role.is_system ? (
          <Lock size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        ) : (
          <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
            <button type="button" onClick={e => { e.stopPropagation(); onRename() }} title="Renomear" style={iconBtn()}>
              <Pencil size={12} />
            </button>
            <button type="button" data-duplicar-cargo onClick={e => { e.stopPropagation(); onDuplicate() }} disabled={deleting}
              title="Duplicar" aria-label={`Duplicar o cargo ${role.label}`} style={iconBtn()}>
              <Copy size={12} />
            </button>
            <button type="button" onClick={e => { e.stopPropagation(); onDelete() }} disabled={deleting} title="Excluir" style={iconBtn()}>
              <Trash2 size={12} />
            </button>
          </span>
        )}
      </div>

      {semAcesso ? (
        <p data-cargo-sem-acesso style={{ fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)', marginTop: 2 }}>
          {CARGO_SEM_ACESSO}
        </p>
      ) : (
        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2 }}>
          {role.is_system ? <Fala>{resumoDoCargoDeSistema(role.key)}</Fala> : resumoDoCargo(perms)}
        </p>
      )}

      {/* A contagem explica por que a exclusão é recusada, então conta ativos e
          inativos — igual ao que `deleteRole` checa. */}
      {count > 0 && (
        canSeeTeam ? (
          <Link
            href={`/admin/team?role=${role.id}`}
            onClick={e => e.stopPropagation()}
            style={peopleLinkStyle}
          >
            <Users size={11} />
            {count} {count === 1 ? 'pessoa' : 'pessoas'}
          </Link>
        ) : (
          <span style={{ ...peopleLinkStyle, color: 'var(--text-faint)' }}>
            <Users size={11} />
            {count} {count === 1 ? 'pessoa' : 'pessoas'}
          </span>
        )
      )}
    </div>
  )
}

const peopleLinkStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6,
  fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
  color: 'var(--brand)', textDecoration: 'none',
}

function RenameCard({ role, onDone }: { role: EditorRole; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateRole, undefined)
  useEffect(() => {
    if (state && 'success' in state && state.success) onDone()
  }, [state, onDone])
  // O erro precisa aparecer: sem ele, uma falha deixava o campo aberto sem
  // dizer nada, e antes disso a falha nem chegava a existir (ver `updateRole`).
  const erro = state && 'error' in state ? state.error : null
  return (
    <div>
      <form
        action={action}
        style={{
          padding: '10px 12px', background: 'var(--surface)',
          border: '1.5px solid var(--brand-soft-border)', borderRadius: 'var(--radius-row)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <input type="hidden" name="roleId" value={role.id} />
        <input
          name="label" defaultValue={role.label} autoFocus required
          aria-label="Nome do cargo"
          style={{
            flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
          }}
        />
        <button type="submit" disabled={pending} title="Salvar" style={iconBtn()}><Check size={13} /></button>
        <button type="button" onClick={onDone} title="Cancelar" style={iconBtn()}><X size={13} /></button>
      </form>
      {erro && (
        <p role="alert" style={{
          fontSize: 'var(--text-2xs)', color: 'var(--danger)',
          fontWeight: 'var(--weight-semibold)', marginTop: 4,
        }}>
          {erro}
        </p>
      )}
    </div>
  )
}

function SystemRoleCard({ role }: { role: EditorRole }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Lock size={15} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          <Fala>{role.label}</Fala>
        </h3>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', lineHeight: 'var(--leading-snug)' }}>
        {explicacaoDoCargoDeSistema(role.key)}
      </p>
    </div>
  )
}

// ─── Matriz de um cargo ──────────────────────────────────────────────────────

function PermissionMatrix({
  role, perms, tabs, onDirtyChange, foraDoPlano, abasForaDoPlano, onSalvo,
}: {
  role: EditorRole
  perms: Partial<Record<AppModule, RoleModulePermission>>
  tabs: ReportTab[]
  onDirtyChange: (dirty: boolean) => void
  foraDoPlano: AppModule[]
  abasForaDoPlano: string[]
  /** A17 da 21ª: o que acabou de ser salvo, para a lista dizer sem recarregar. */
  onSalvo?: (levels: Levels, tabs: ReportTab[]) => void
}) {
  const [state, action, pending] = useActionState(saveRolePermissions, undefined)
  const [levels, setLevels] = useState<Levels>(() => buildLevels(perms))
  const [reportTabs, setReportTabs] = useState<ReportTab[]>(() => [...tabs])
  const [caixas, setCaixas] = useState<CaixasDoCargo>(role.inboxCaixas)
  const [baseline, setBaseline] = useState(() => ({
    levels: buildLevels(perms), reportTabs: [...tabs],
    caixas: role.inboxCaixas,
  }))
  // As abas marcadas que VALEM com estes níveis: a Financeiro pede o Financeiro
  // em Ver (o Heitor, 2026-11-23: "financeiro é uma coisa, vendas é outra").
  // É o que se grava, o que a prévia e o "falta escolher" contam.
  const abasValendo = levels.reports === 'NONE' ? [] : abasQueValem(reportTabs, levels)
  const [dismissed, setDismissed] = useState(false)
  // A2 da 12ª: o que falta escolher, dito ao tentar salvar (não um padrão escondido).
  const [falta, setFalta] = useState<string | null>(null)
  // A14 da 15ª: o módulo que falta escolher, destacado — o aviso do pé não basta.
  const [destaque, setDestaque] = useState<AppModule | null>(null)

  const dirty = useMemo(
    () => ALL_MODULES.some(m => levels[m] !== baseline.levels[m])
      || reportTabs.length !== baseline.reportTabs.length
      || reportTabs.some(t => !baseline.reportTabs.includes(t))
      || caixas !== baseline.caixas,
    [levels, reportTabs, caixas, baseline],
  )

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  // Salvou: a partir daqui o estado atual é o novo ponto de comparação, e a
  // mensagem de sucesso volta a valer.
  // No render, quando chega um resultado novo da action — e não num efeito.
  const [salvamentoVisto, setSalvamentoVisto] = useState(state)
  if (salvamentoVisto !== state) {
    setSalvamentoVisto(state)
    if (state?.success) {
      setBaseline({ levels, reportTabs, caixas })
      setDismissed(false)
    }
  }
  // A17 da 17ª (princípio 3): o "Acessos salvos." do rodapé passava
  // despercebido — o aviso de "deu certo" do sistema é o toast (design.md).
  const avisarSalvo = useEffectEvent(() => {
    toast.success(`Cargo “${role.label}” salvo.`)
    onSalvo?.(levels, abasValendo)
  })
  useEffect(() => { if (state?.success) avisarSalvo() }, [state])

  function setLevel(module: AppModule, v: PermissionLevel) {
    setLevels(prev => ({ ...prev, [module]: v }))
    setDismissed(true)
    setFalta(null)
    setDestaque(null)
  }
  function toggleReportTab(t: ReportTab) {
    setReportTabs(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
    setDismissed(true)
    setFalta(null)
    setDestaque(null)
  }

  // O que o cargo ligou e ainda não escolheu: as abas do Relatórios em "Ver"
  // (A2 da 12ª, princípio 3).
  function oQueFalta(): string | null {
    const relatorio = !foraDoPlano.includes('reports') && levels.reports !== 'NONE' && abasValendo.length === 0
    return relatorio ? textoDoQueFaltaNoCargo() : null
  }

  // A16 da 21ª (princípio 3): o que falta escolher fica junto do "Salvar acessos"
  // já antes do clique — o laranja pequeno da linha passava, e o botão ativo
  // parecia salvar.
  const faltaAgora = oQueFalta()

  // A14 da 15ª (princípio 7): a tela vai até o módulo sem escolha e o destaca.
  // A3 da 22ª: também pelo aviso junto do Salvar — num cargo longo ele ficava
  // no rodapé, e nada levava à linha.
  function irAoQueFalta() {
    setFalta(oQueFalta())
    const primeiro: AppModule | null = oQueFalta() ? 'reports' : null
    setDestaque(primeiro)
    if (primeiro) document.querySelector(`[data-modulo="${primeiro}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  const avisoDoQueFalta = falta ?? faltaAgora
  // Item 21 de 18/11: o que está na matriz agora não abre módulo nenhum — pela
  // conta do contexto (o plano, Relatórios sem aba, a Auditoria).
  const nothingGranted = cargoSemAcesso(
    { linhas: ALL_MODULES.map(m => ({ module: m, level: levels[m] })), abas: levels.reports === 'NONE' ? [] : reportTabs },
    { foraDoPlano, abasForaDoPlano },
  )
  const showSuccess    = !!state?.success && !dismissed

  return (
    <form
      action={action}
      className="card"
      onSubmit={e => {
        if (oQueFalta()) {
          e.preventDefault()
          // A27 da 18ª: a tela rola até o módulo; o aviso vai junto, à vista.
          toast.warning(oQueFalta()!)
          irAoQueFalta()
        } else setFalta(null)
      }}
    >
      <input type="hidden" name="roleId" value={role.id} />
      {MODULOS_DO_CARGO.map(m => (
        <input key={m} type="hidden" name={`level:${m}`} value={levels[m]} />
      ))}
      {/* Aba marcada vira `report:<aba>=on`, como um checkbox — a action só
          grava as que chegam. Com Relatórios em "Sem acesso" nenhuma é enviada,
          senão o cargo guardaria abas que não tem como abrir; nem a que pede um
          módulo que o cargo não tem (a Financeiro sem o Financeiro em Ver). */}
      {abasValendo.map(t => (
        <input key={t} type="hidden" name={`report:${t}`} value="on" />
      ))}
      <input type="hidden" name="inbox_caixas" value={caixas} />

      {/* O "como se lê" da matriz mora na dica (2026-11-16 — era um parágrafo
          fixo); fora do <h3>, para o nome do título continuar só o título. */}
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
        <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          O que <span style={{ color: 'var(--brand)' }}><Fala>{role.label}</Fala></span> acessa
        </h3>
        <Dica rotulo="Como se lê a matriz de acessos">
          Cada área tem um nível. O “i” ao lado de cada área diz o que o nível escolhido libera de verdade.
        </Dica>
      </div>

      {nothingGranted && (
        <div data-cargo-sem-acesso style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 18,
          background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '10px 12px',
        }}>
          <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
            {CARGO_SEM_ACESSO}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* O que o plano da rede não inclui não aparece: daria acesso a nada. */}
        {MODULE_GROUPS.map(g => ({ ...g, modules: g.modules.filter(m => !foraDoPlano.includes(m)) })).filter(g => g.modules.length > 0).map(group => (
          <section key={group.key}>
            {/* O que o grupo reúne mora na dica ao lado do nome (2026-11-16). */}
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <h4 className="overline"><Fala>{group.label}</Fala></h4>
              <Dica rotulo={`Sobre: ${group.label}`}><Fala>{group.hint}</Fala></Dica>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {group.modules.map((module, i) => (
                <ModuleRow
                  key={module}
                  module={module}
                  level={levels[module]}
                  last={i === group.modules.length - 1}
                  destacado={destaque === module}
                  // A20 da 19ª: no celular o toast some e o aviso do Salvar fica fora da vista — ele vai no módulo.
                  aviso={destaque === module ? falta : null}
                  reportTabs={reportTabs}
                  levels={levels}
                  caixas={caixas}
                  onLevel={v => setLevel(module, v)}
                  onReportTab={toggleReportTab}
                  onCaixas={v => { setCaixas(v); setDismissed(true) }}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* A16 da 15ª (princípio 3): o que o plano não inclui some da matriz — e a tela diz o quê. */}
      {foraDoPlano.length > 0 && (
        <p data-fora-do-plano style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', marginTop: 16 }}>
          {`Fora do plano da rede: ${foraDoPlano.map(m => MODULE_LABELS[m]).join(', ')}. ${foraDoPlano.length === 1 ? 'Entra' : 'Entram'} na matriz quando o plano ${foraDoPlano.length === 1 ? 'o' : 'os'} incluir.`}
        </p>
      )}

      <MenuPreview levels={levels} reportTabs={abasValendo} foraDoPlano={foraDoPlano} />

      {state?.error && (
        <p style={{
          color: 'var(--warning)', background: 'var(--warning-soft)',
          borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
          fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', marginTop: 16,
        }}>
          {state.error}
        </p>
      )}

      <div style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap',
      }}>
        {/* A27 da 18ª (princípio 3): o que falta escolher, junto do botão. */}
        {/* A3 da 22ª: o aviso leva à primeira linha que falta. */}
        {avisoDoQueFalta && (
          <span data-falta-escolher role={falta ? 'alert' : undefined} style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            color: 'var(--warning)', background: 'var(--warning-soft)',
            borderRadius: 'var(--radius-field-token)', padding: '8px 12px',
            fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', flex: '1 1 260px',
          }}>
            <Fala>{avisoDoQueFalta}</Fala>
            <button type="button" data-ir-ao-que-falta onClick={irAoQueFalta} className="btn-ghost" style={{
              padding: '2px 8px', color: 'var(--warning)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
              textDecoration: 'underline',
            }}>
              Ir até lá
            </button>
          </span>
        )}
        {showSuccess && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--success)',
            fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
          }}>
            <CheckCircle2 size={14} /> Acessos salvos.
          </span>
        )}
        {dirty && !pending && (
          <span style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)' }}>
            Alterações não salvas
          </span>
        )}
        <button type="submit" disabled={pending || !dirty} className="btn-primary">
          {pending ? 'Salvando…' : 'Salvar acessos'}
        </button>
      </div>
    </form>
  )
}

function ModuleRow({
  module, level, last, destacado, aviso, nota, travadoEm = null, reportTabs, levels, caixas, onLevel, onReportTab, onCaixas,
}: {
  module: AppModule
  level: PermissionLevel
  last: boolean
  destacado?: boolean
  /** A20 da 19ª: o que falta escolher, no módulo para onde a tela rolou. */
  aviso?: string | null
  /** A1 da 22ª: o que o nível escolhido não diz (o PDV aberto pelo Financeiro). */
  nota?: string | null
  /** A1 da 23ª: o nível que vale por outro módulo (o PDV pelo Financeiro) — o seletor o mostra, travado. */
  travadoEm?: PermissionLevel | null
  reportTabs: ReportTab[]
  levels: Levels
  caixas: CaixasDoCargo
  onLevel: (v: PermissionLevel) => void
  onReportTab: (t: ReportTab) => void
  onCaixas: (v: CaixasDoCargo) => void
}) {
  const enabled     = level !== 'NONE'
  const networkOnly = NETWORK_ONLY.includes(module)
  const soNaRede    = SO_NA_REDE_NOTE[module]

  return (
    <div data-modulo={module} data-destacado={destacado ? '1' : undefined} style={{
      padding: destacado ? '12px 10px' : '12px 4px',
      borderBottom: last ? undefined : '1px solid var(--hairline)',
      // A14 da 15ª: o que falta escolher, no lugar onde se escolhe.
      ...(destacado ? {
        background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)',
        outline: '1px solid var(--warning)',
      } : null),
    }}>
      {/* `flexWrap`: nome do módulo e seletor de nível lado a lado quando cabe,
          um sobre o outro quando não. Sem isso, no celular o seletor de três
          níveis espremia o nome do módulo até ele quebrar letra a letra. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
          }}>
            <Fala>{MODULE_LABELS[module]}</Fala>
            {/* O que o módulo abrange — antes escrito e nunca mostrado. */}
            {MODULE_HINTS[module] && (
              <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--text-faint)', marginLeft: 6 }}>
                · <Fala>{MODULE_HINTS[module]}</Fala>
              </span>
            )}
            {/* O que o nível libera e de quem é o módulo moram na dica ao lado
                do nome (2026-11-16 — eram duas linhas fixas embaixo dele).
                Campanhas e Automações dizem sempre que são da rede (D-2,
                2026-10-29); os outros de rede, só quando ligados. */}
            {(LEVEL_COPY[module][level] || soNaRede || (networkOnly && enabled)) && (
              <span style={{ marginLeft: 6, fontWeight: 'var(--weight-medium)' }}>
                <Dica rotulo={`Sobre: ${MODULE_LABELS[module]}`}>
                  {LEVEL_COPY[module][level] && (
                    <span data-frase-do-nivel style={{ display: 'block' }}>
                      <Fala>{LEVEL_COPY[module][level] ?? ''}</Fala>
                    </span>
                  )}
                  {(soNaRede || (networkOnly && enabled)) && (
                    <span data-nota-de-abrangencia style={{ display: 'block', marginTop: 6, fontStyle: 'italic' }}>
                      <Fala>{soNaRede ?? notaDeAbrangencia(module)}</Fala>
                    </span>
                  )}
                </Dica>
              </span>
            )}
          </div>
          {nota && (
            <div data-pdv-pelo-financeiro style={{
              marginTop: 5, fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-muted)',
            }}>
              <Fala>{nota}</Fala>
            </div>
          )}
        </div>

        <SegmentedLevel
          options={MODULE_LEVELS[module]}
          value={travadoEm ?? level}
          travado={!!travadoEm}
          motivo={nota ?? undefined}
          onChange={onLevel}
        />
      </div>

      {/* Quais relatórios, um a um. "Ver relatórios" num nível só entregava o
          faturamento da rede junto com o funil de leads. */}
      {module === 'reports' && enabled && (
        <AbasDeRelatorio marcadas={reportTabs} levels={levels} onToggle={onReportTab} />
      )}

      {/* O inbox é do CRM. Ligar a pessoa a um número decide por onde ela
          envia; isto decide o que ela vê (2026-09-27). */}
      {module === 'crm' && enabled && (
        <CaixasDoInbox valor={caixas} onChange={onCaixas} />
      )}

      {/* A20 da 19ª (princípio 3): o aviso fixo, onde a tela rolou — o do
          Salvar ficava fora da vista no celular, e o toast some em 4 s. */}
      {aviso && (
        <p data-falta-no-modulo role="alert" style={{
          display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 10,
          color: 'var(--warning)', fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)',
          lineHeight: 'var(--leading-snug)',
        }}>
          <AlertTriangle size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
          <Fala>{aviso}</Fala>
        </p>
      )}
    </div>
  )
}

function CaixasDoInbox({
  valor, onChange,
}: {
  valor: CaixasDoCargo
  onChange: (v: CaixasDoCargo) => void
}) {
  const atual = OPCOES_DE_CAIXAS.find(o => o.key === valor) ?? OPCOES_DE_CAIXAS[0]!
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap',
      }}>
        <span className="overline">WhatsApp no inbox</span>
        {/* O que a escolha faz mora na dica (2026-11-16 — era uma linha fixa). */}
        <Dica rotulo="Sobre o WhatsApp no inbox">
          <span data-testid="explicacao-caixas">
            <Fala>{atual.explicacao}</Fala>
          </span>
        </Dica>
        <SegSelect
          options={OPCOES_DE_CAIXAS.map(o => ({ key: o.key, label: o.label }))}
          value={valor}
          onSelect={k => onChange(k as CaixasDoCargo)}
          ariaLabel="Quais números de WhatsApp o cargo vê no inbox"
        />
      </div>
    </div>
  )
}

function AbasDeRelatorio({
  marcadas, levels, onToggle,
}: {
  marcadas: ReportTab[]
  levels: Levels
  onToggle: (t: ReportTab) => void
}) {
  // A aba que pede um módulo que o cargo não tem fica desligada, com o motivo à
  // vista (o Heitor, 2026-11-23: a Financeiro "pede o Financeiro"; princípio 3).
  const valendo = abasQueValem(marcadas, levels)
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
        <span className="overline">Relatórios liberados</span>
        {valendo.length === 0 && (
          <span style={{
            fontSize: 'var(--text-2xs)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)',
          }}>
            nenhum marcado — a tela não abre
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {ALL_REPORT_TABS.map(t => {
          const motivo = motivoDaAbaFechada(t, levels)
          const on = !motivo && marcadas.includes(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => onToggle(t)}
              disabled={!!motivo}
              title={motivo ? `${REPORT_TAB_LABELS[t]} ${motivo} em Ver.` : REPORT_TAB_HINTS[t]}
              aria-pressed={on}
              {...(motivo ? { 'data-aba-fechada': t } : {})}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 11px', borderRadius: 999, cursor: motivo ? 'not-allowed' : 'pointer',
                fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-bold)',
                border: '1.5px solid',
                transition: 'all 120ms',
                background:  on ? 'var(--brand)' : motivo ? 'var(--bg-app)' : 'var(--surface)',
                color:       on ? 'var(--on-brand)' : motivo ? 'var(--text-faint)' : 'var(--text-muted)',
                borderColor: on ? 'var(--brand)' : 'var(--border)',
                ...(motivo ? { opacity: 0.75 } : null),
              }}
            >
              {on && <Check size={11} />}
              {motivo && <Lock size={11} aria-hidden="true" />}
              <Fala>{REPORT_TAB_LABELS[t]}</Fala>
              {motivo && <span style={{ fontWeight: 'var(--weight-semibold)' }}>· {motivo}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Pré-visualização ────────────────────────────────────────────────────────

function MenuPreview({ levels, reportTabs, foraDoPlano }: { levels: Levels; reportTabs: ReportTab[]; foraDoPlano: AppModule[] }) {
  // A pré-visualização usa o estado NÃO salvo: é para conferir antes de gravar.
  // Relatórios sem nenhuma aba marcada não abre nada — o contexto de
  // autorização faz a mesma conta (`buildContext`), e aqui ela precisa
  // aparecer, senão a prévia promete uma entrada de menu que não existe.
  const permissions = {
    ...levels,
    reports: reportTabs.length === 0 ? 'NONE' : levels.reports,
  } as ResolvedPermissions
  // A7 da 7ª simulação: "Configurações" sem Configurações em Gerenciar é só a
  // aba dos outros módulos (o Financeiro, só Comissões e taxas) — o resumo diz.
  const gerencia = (m: AppModule) => permissions[m] === 'MANAGE'
  const comAbas = (abas: Parameters<typeof rotuloDasAbasAlcancadas>[0]) => (rotulo: string) =>
    rotulo === 'Configurações' ? (rotuloDasAbasAlcancadas(abas, gerencia, { soAsDela: true }) ?? rotulo) : rotulo
  // A-CONF1 da 25ª: o cargo editável nunca é o de Admin da rede — sem aba que a pessoa use, Configurações
  // não aparece (a configuração da rede toda é só da Admin da rede, CLAUDE.md §11).
  const semConfiguracoes = soLeriaAsConfiguracoes(permissions, false)
  const doMenu = (menu: typeof ADMIN_MENU) => semConfiguracoes ? menu.filter(e => e.key !== 'settings') : menu
  const network = menuLabelsFor(doMenu(ADMIN_MENU), permissions).map(comAbas(ABAS_DA_REDE))
  const branch  = menuLabelsFor(doMenu(BRANCH_MENU), permissions).map(comAbas(ABAS_DA_UNIDADE))
  const sobreDocumentos = [...network, ...branch].includes('Documentos') ? documentosNoResumo(levels) : null
  // A2 da 22ª: de onde vem Tratamentos, como Documentos.
  const sobreTratamentos = [...network, ...branch].includes('Tratamentos') ? tratamentosNoResumo(levels) : null
  // A1 (CG-16, princípio 3): fora do plano da rede, o Copilot não existe — o resumo não o promete.
  const sobreCopilot = foraDoPlano.includes('copilot') ? null : copilotNoResumo(levels.copilot)
  // A2: o Prontuário sem Clientes — por onde ela chega à cliente.
  const sobreProntuario = foraDoPlano.includes('medical_records') ? null : prontuarioSemClientesNoResumo(levels)

  return (
    <div style={{
      marginTop: 22, padding: '14px 16px',
      background: 'var(--bg-app)', borderRadius: 'var(--radius-card-sm)',
      border: '1px solid var(--border)',
    }}>
      {/* A24 da 21ª: de onde vem Documentos, na dica ao lado do título. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="overline">O que essa pessoa vai ver</span>
        {sobreDocumentos && <Dica rotulo="De onde vem Documentos">{sobreDocumentos}</Dica>}
        {sobreTratamentos && <Dica rotulo="De onde vem Tratamentos">{sobreTratamentos}</Dica>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        <PreviewLine title="Na unidade" items={branch} marca="data-resumo-na-unidade" />
        <PreviewLine title={<Fala>Na rede</Fala>} items={network} marca="data-resumo-na-rede" />
      </div>
      {/* A27 da 26ª: "Na rede" depende da abrangência de quem recebe o cargo, e a configuração da rede só se vê. */}
      {notaDoResumoDaRede(network, branch) && (
        <p data-resumo-da-rede style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          {notaDoResumoDaRede(network, branch)}
        </p>
      )}
      {/* Relatórios em Ver sem aba nenhuma some do resumo: o resumo diz por
          quê, em vez de só o aviso pequeno ao lado da matriz (A5, 2026-11-01). */}
      {levels.reports !== 'NONE' && reportTabs.length === 0 && (
        <p data-relatorios-sem-aba style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)', marginTop: 8 }}>
          Relatórios não aparece: nenhum relatório está marcado. Marque ao menos um em &quot;Relatórios liberados&quot;.
        </p>
      )}
      {/* D1 da 12ª: o “Vender” da ficha é de quem recebe — o resumo diz, para
          o comercial não esperar um botão que o cargo não abre (princípio 3). */}
      {/* A17 da 17ª: o Copilot não é entrada de menu — o resumo diz à parte. */}
      {sobreCopilot && (
        <p data-resumo-copilot style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          {sobreCopilot}
        </p>
      )}
      {sobreProntuario && (
        <p data-resumo-prontuario-sem-clientes style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          {sobreProntuario}
        </p>
      )}
      {/* A2 da 23ª: quem inicia e conclui, e o que pede o Prontuário. */}
      {conclusaoNoResumo(levels) && (
        <p data-resumo-conclui style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          {conclusaoNoResumo(levels)}
        </p>
      )}
      {/* A19 da 27ª: a Minha agenda e as Minhas comissões dependem de a pessoa atender (ou ter comissão). */}
      {vistasPessoaisNoResumo(levels, foraDoPlano) && (
        <p data-resumo-vistas-pessoais style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          {vistasPessoaisNoResumo(levels, foraDoPlano)}
        </p>
      )}
      {quemVendeNoResumo(levels) && (
        <p data-quem-vende style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--text-muted)', marginTop: 8 }}>
          {quemVendeNoResumo(levels)}
        </p>
      )}
    </div>
  )
}

function PreviewLine({ title, items, marca }: { title: React.ReactNode; items: string[]; marca?: string }) {
  return (
    <div {...(marca ? { [marca]: '' } : {})} style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span style={{
        fontSize: 'var(--text-2xs)', color: 'var(--text-muted)',
        fontWeight: 'var(--weight-bold)', minWidth: 68,
      }}>
        {title}
      </span>
      {/* O Dashboard nunca some, então "nada" seria mentira. */}
      <span style={{
        fontSize: 'var(--text-xs-sz)',
        color: items.length <= 1 ? 'var(--text-muted)' : 'var(--text)',
      }}>
        {items.length <= 1 ? 'só o Dashboard' : items.join(' · ')}
      </span>
    </div>
  )
}

// ─── Controles ───────────────────────────────────────────────────────────────

function SegmentedLevel({ options, value, travado = false, motivo, onChange }: {
  options: readonly PermissionLevel[]
  value: PermissionLevel
  /** A1 da 23ª: o nível vale por outro módulo — mostrado, sem trocar aqui. */
  travado?: boolean
  motivo?: string
  onChange: (v: PermissionLevel) => void
}) {
  return (
    <div {...(travado ? { 'data-nivel-travado': value } : {})} title={travado ? motivo : undefined}
      style={{ ...segFrame, flexShrink: 0, ...(travado ? { opacity: 0.75 } : null) }}>
      {(['NONE', 'VIEW', 'MANAGE'] as const).map(lvl => {
        const available = options.includes(lvl)
        const active    = value === lvl
        // A3 da 24ª (princípio 3): travado, os outros níveis tinham cara de
        // clicáveis — só o que vale aparece, com o cadeado (a largura fica).
        const escondido = !available || (travado && !active)
        return (
          <button
            key={lvl}
            type="button"
            disabled={!available || travado}
            aria-hidden={escondido && available ? true : undefined}
            aria-pressed={active}
            onClick={() => onChange(lvl)}
            title={!available ? `${LEVEL_LABELS[lvl]} não se aplica a esta área` : travado ? motivo : undefined}
            style={{
              ...segItem(active),
              // Largura fixa mesmo quando o nível não existe para o módulo: sem
              // isto a coluna direita serrilha entre áreas de 2 e 3 níveis.
              width: 86,
              visibility: escondido ? 'hidden' : 'visible',
              cursor: travado ? 'not-allowed' : available ? 'pointer' : 'default',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}
          >
            {travado && active && <Lock size={11} aria-hidden="true" />}
            {LEVEL_LABELS[lvl]}
          </button>
        )
      })}
    </div>
  )
}

const segFrame: React.CSSProperties = {
  display: 'inline-flex', padding: 2, gap: 2,
  background: 'var(--bg-app)', border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-field-token)',
}

function segItem(active: boolean): React.CSSProperties {
  return {
    padding: '5px 12px', border: 'none', cursor: 'pointer',
    borderRadius: 'calc(var(--radius-field-token) - 2px)',
    fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-bold)',
    background: active ? 'var(--brand)' : 'transparent',
    color: active ? 'var(--on-brand)' : 'var(--text-muted)',
    transition: 'background 120ms, color 120ms',
    whiteSpace: 'nowrap',
  }
}

function iconBtn(): React.CSSProperties {
  return {
    background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 0,
    borderRadius: 4, color: 'var(--brand)',
  }
}

// ─── Confirmação ─────────────────────────────────────────────────────────────
// Substitui o confirm() nativo, que não dá para explicar a consequência.

function ConfirmDialog({
  open, title, body, confirmLabel, danger, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="modal"
      style={{ maxWidth: 420 } as React.CSSProperties}
      onCancel={e => { e.preventDefault(); onCancel() }}
      onClick={e => { if (e.target === ref.current) onCancel() }}
    >
      <div style={{ padding: '22px 24px 24px' }}>
        <h2 style={{
          fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)',
          color: 'var(--text)', marginBottom: 6,
        }}>
          {title}
        </h2>
        <p style={{
          fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)',
          lineHeight: 'var(--leading-snug)', marginBottom: 20,
        }}>
          {body}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button>
          <button
            type="button"
            onClick={onConfirm}
            className={danger ? undefined : 'btn-primary'}
            style={danger ? {
              padding: '9px 16px', borderRadius: 'var(--radius-field-token)',
              fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)',
              border: '1px solid var(--danger)', background: 'var(--danger-soft)', color: 'var(--danger)', cursor: 'pointer',
            } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
