'use client'

import React, { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Plus, Lock, Trash2, Pencil, Check, X, CheckCircle2, AlertTriangle, Users } from 'lucide-react'
import Link from 'next/link'
import { createRole, updateRole, deleteRole } from '@/actions/roles'
import { saveRolePermissions } from '@/actions/permissions'
import {
  ALL_MODULES, MODULE_LABELS, MODULE_LEVELS, LEVEL_LABELS,
  SCOPE_LABELS, isScoped,
} from '@/lib/permissions'
import {
  MODULE_GROUPS, LEVEL_COPY, SCOPE_NOTE, SENSITIVE_NOTE,
  NETWORK_ONLY, NETWORK_ONLY_NOTE,
} from '@/lib/permissions-copy'
import { ADMIN_MENU, BRANCH_MENU, menuLabelsFor } from '@/lib/menu'
import type {
  AppModule, PermissionLevel, PermissionScope, ScopedModule, ResolvedPermissions,
} from '@estetica-os/types'

export interface EditorRole {
  id:           string
  key:          string
  label:        string
  is_system:    boolean
  memberCount?: number
}

/** O que um cargo tem em um módulo: até onde mexe (nível) e em quais registros (escopo). */
export interface RoleModulePermission {
  level: PermissionLevel
  scope: PermissionScope
}

interface RolesEditorProps {
  roles:       EditorRole[]
  permsByRole: Record<string, Partial<Record<AppModule, RoleModulePermission>>>
  /** Cargos e Equipe são módulos diferentes: sem `team`, o atalho não é link. */
  canSeeTeam:  boolean
}

type Levels = Record<AppModule, PermissionLevel>
type Scopes = Record<AppModule, PermissionScope>

function buildLevels(perms: Partial<Record<AppModule, RoleModulePermission>>): Levels {
  return Object.fromEntries(ALL_MODULES.map(m => [m, perms[m]?.level ?? 'NONE'])) as Levels
}

/**
 * Escopo inicial. Módulo que está em "Sem acesso" nasce em OWN quando for
 * habilitado: o valor gravado ali é `ALL` por default do banco, nunca uma
 * escolha de alguém — e a opção mais permissiva não deve vencer por omissão.
 * Módulo já liberado carrega o que foi realmente escolhido.
 */
function buildScopes(perms: Partial<Record<AppModule, RoleModulePermission>>): Scopes {
  return Object.fromEntries(ALL_MODULES.map(m => {
    const p = perms[m]
    return [m, p && p.level !== 'NONE' ? p.scope : 'OWN']
  })) as Scopes
}

export function RolesEditor({ roles, permsByRole, canSeeTeam }: RolesEditorProps) {
  const editable = roles.filter(r => !r.is_system)
  const [selectedId, setSelectedId] = useState<string | null>(editable[0]?.id ?? roles[0]?.id ?? null)
  const [pendingSelect, setPendingSelect] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  const selected = roles.find(r => r.id === selectedId) ?? null

  // Trocar de cargo com alteração pendente descartava tudo em silêncio.
  function requestSelect(id: string) {
    if (id === selectedId) return
    if (dirty) { setPendingSelect(id); return }
    setSelectedId(id)
  }

  return (
    <div className="master-detail">
      <RoleListPanel
        roles={roles}
        selectedId={selectedId}
        permsByRole={permsByRole}
        canSeeTeam={canSeeTeam}
        dirtyId={dirty ? selectedId : null}
        onSelect={requestSelect}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        {selected?.is_system && <SystemRoleCard role={selected} />}

        {selected && !selected.is_system && (
          <PermissionMatrix
            key={selected.id}
            role={selected}
            perms={permsByRole[selected.id] ?? {}}
            onDirtyChange={setDirty}
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

      <ConfirmDialog
        open={!!pendingSelect}
        title="Descartar alterações?"
        body="Você mexeu nos acessos deste cargo e ainda não salvou. Trocar de cargo agora descarta o que foi alterado."
        confirmLabel="Descartar e trocar"
        onConfirm={() => { setSelectedId(pendingSelect); setPendingSelect(null); setDirty(false) }}
        onCancel={() => setPendingSelect(null)}
      />
    </div>
  )
}

// ─── Lista de cargos ─────────────────────────────────────────────────────────

function RoleListPanel({
  roles, selectedId, permsByRole, canSeeTeam, dirtyId, onSelect,
}: {
  roles: EditorRole[]
  selectedId: string | null
  permsByRole: Record<string, Partial<Record<AppModule, RoleModulePermission>>>
  canSeeTeam: boolean
  dirtyId: string | null
  onSelect: (id: string) => void
}) {
  const [showForm, setShowForm] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<EditorRole | null>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [createState, createAction, creating] = useActionState(createRole, undefined)

  // Só reage quando o resultado da action muda (não a cada render) — senão
  // reabrir o form seria fechado na hora enquanto createState.success persiste.
  useEffect(() => {
    if (createState && 'success' in createState && createState.success) {
      setShowForm(false)
      if (createState.role) onSelect(createState.role.id)
    }
  }, [createState, onSelect])

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
            onClick={() => setShowForm(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <Plus size={13} /> Novo
          </button>
        )}
      </div>

      {showForm && (
        <form
          action={createAction}
          style={{
            padding: 12, background: 'var(--bg-app)',
            border: '1.5px solid var(--brand-soft-border)', borderRadius: 'var(--radius-card-sm)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <input
            name="label" type="text" required autoFocus
            className="field" placeholder="Ex.: Recepção"
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
            selected={role.id === selectedId}
            unsaved={role.id === dirtyId}
            canSeeTeam={canSeeTeam}
            deleting={pending}
            onSelect={() => onSelect(role.id)}
            onRename={() => setRenaming(role.id)}
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

/** Resumo de uma linha: quantas áreas o cargo abre e quantas ficam restritas. */
function summarize(perms: Partial<Record<AppModule, RoleModulePermission>>): string {
  const open = ALL_MODULES.filter(m => (perms[m]?.level ?? 'NONE') !== 'NONE')
  if (open.length === 0) return 'Nenhum acesso ainda'
  const own = open.filter(m => isScoped(m) && perms[m]?.scope === 'OWN').length
  const areas = `${open.length} ${open.length === 1 ? 'área' : 'áreas'}`
  return own > 0 ? `${areas} · ${own} só os próprios` : areas
}

function RoleCard({
  role, perms, selected, unsaved, canSeeTeam, deleting, onSelect, onRename, onDelete,
}: {
  role: EditorRole
  perms: Partial<Record<AppModule, RoleModulePermission>>
  selected: boolean
  unsaved: boolean
  canSeeTeam: boolean
  deleting: boolean
  onSelect: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const count = role.memberCount ?? 0

  return (
    <div
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
          {role.label}
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
            <button type="button" onClick={e => { e.stopPropagation(); onDelete() }} disabled={deleting} title="Excluir" style={iconBtn()}>
              <Trash2 size={12} />
            </button>
          </span>
        )}
      </div>

      <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 2 }}>
        {role.is_system ? 'Acesso total à rede' : summarize(perms)}
      </p>

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
  return (
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
        style={{
          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
          fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)',
        }}
      />
      <button type="submit" disabled={pending} title="Salvar" style={iconBtn()}><Check size={13} /></button>
      <button type="button" onClick={onDone} title="Cancelar" style={iconBtn()}><X size={13} /></button>
    </form>
  )
}

function SystemRoleCard({ role }: { role: EditorRole }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Lock size={15} style={{ color: 'var(--brand)' }} />
        <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          {role.label}
        </h3>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)', lineHeight: 'var(--leading-snug)' }}>
        É o cargo do sistema: tem acesso a tudo na rede, em todas as unidades, e por isso não passa
        por esta matriz. Ele não pode ser editado nem excluído — se pudesse, dava para trancar a si
        mesmo para fora da própria rede.
      </p>
    </div>
  )
}

// ─── Matriz de um cargo ──────────────────────────────────────────────────────

function PermissionMatrix({
  role, perms, onDirtyChange,
}: {
  role: EditorRole
  perms: Partial<Record<AppModule, RoleModulePermission>>
  onDirtyChange: (dirty: boolean) => void
}) {
  const [state, action, pending] = useActionState(saveRolePermissions, undefined)
  const [levels, setLevels] = useState<Levels>(() => buildLevels(perms))
  const [scopes, setScopes] = useState<Scopes>(() => buildScopes(perms))
  const [baseline, setBaseline] = useState(() => ({ levels: buildLevels(perms), scopes: buildScopes(perms) }))
  const [dismissed, setDismissed] = useState(false)

  const dirty = useMemo(
    () => ALL_MODULES.some(m =>
      levels[m] !== baseline.levels[m] ||
      (isScoped(m) && levels[m] !== 'NONE' && scopes[m] !== baseline.scopes[m]),
    ),
    [levels, scopes, baseline],
  )

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])

  // Salvou: a partir daqui o estado atual é o novo ponto de comparação, e a
  // mensagem de sucesso volta a valer.
  useEffect(() => {
    if (state?.success) {
      setBaseline({ levels, scopes })
      setDismissed(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function setLevel(module: AppModule, v: PermissionLevel) {
    setLevels(prev => ({ ...prev, [module]: v }))
    setDismissed(true)
  }
  function setScope(module: AppModule, v: PermissionScope) {
    setScopes(prev => ({ ...prev, [module]: v }))
    setDismissed(true)
  }

  const nothingGranted = ALL_MODULES.every(m => levels[m] === 'NONE')
  const showSuccess    = !!state?.success && !dismissed

  return (
    <form action={action} className="card">
      <input type="hidden" name="roleId" value={role.id} />
      {ALL_MODULES.map(m => (
        <React.Fragment key={m}>
          <input type="hidden" name={`level:${m}`} value={levels[m]} />
          {isScoped(m) && <input type="hidden" name={`scope:${m}`} value={scopes[m]} />}
        </React.Fragment>
      ))}

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 'var(--weight-extrabold)', color: 'var(--text)' }}>
          O que <span style={{ color: 'var(--brand)' }}>{role.label}</span> acessa
        </h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs-sz)', marginTop: 3 }}>
          Cada área tem um nível. A frase abaixo do nível diz o que ele libera de verdade.
        </p>
      </div>

      {nothingGranted && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 18,
          background: 'var(--warning-soft)', borderRadius: 'var(--radius-field-token)', padding: '10px 12px',
        }}>
          <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--warning)', fontWeight: 'var(--weight-semibold)' }}>
            Este cargo ainda não abre nada. Quem receber ele entra no sistema e só enxerga o Dashboard.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {MODULE_GROUPS.map(group => (
          <section key={group.key}>
            <div style={{ marginBottom: 8 }}>
              <h4 className="overline">{group.label}</h4>
              <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 1 }}>
                {group.hint}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {group.modules.map((module, i) => (
                <ModuleRow
                  key={module}
                  module={module}
                  level={levels[module]}
                  scope={scopes[module]}
                  last={i === group.modules.length - 1}
                  onLevel={v => setLevel(module, v)}
                  onScope={v => setScope(module, v)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <MenuPreview levels={levels} />

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
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 20,
      }}>
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
  module, level, scope, last, onLevel, onScope,
}: {
  module: AppModule
  level: PermissionLevel
  scope: PermissionScope
  last: boolean
  onLevel: (v: PermissionLevel) => void
  onScope: (v: PermissionScope) => void
}) {
  const scoped      = isScoped(module)
  const enabled     = level !== 'NONE'
  const sensitive   = SENSITIVE_NOTE[module]
  const networkOnly = NETWORK_ONLY.includes(module)

  return (
    <div style={{
      padding: '12px 4px',
      borderBottom: last ? undefined : '1px solid var(--hairline)',
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
            {MODULE_LABELS[module]}
          </div>
          <div style={{
            fontSize: 'var(--text-2xs)', color: enabled ? 'var(--text-soft)' : 'var(--text-faint)',
            marginTop: 3, lineHeight: 'var(--leading-snug)', maxWidth: 460,
          }}>
            {LEVEL_COPY[module][level] ?? ''}
          </div>
          {networkOnly && enabled && (
            <div style={{
              fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 4,
              fontStyle: 'italic',
            }}>
              {NETWORK_ONLY_NOTE}
            </div>
          )}
          {sensitive && enabled && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5,
              fontSize: 'var(--text-2xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--warning)',
            }}>
              <AlertTriangle size={11} /> {sensitive}
            </div>
          )}
        </div>

        <SegmentedLevel
          options={MODULE_LEVELS[module]}
          value={level}
          onChange={onLevel}
        />
      </div>

      {/* Alcance sempre presente nos módulos escopáveis — esmaecido enquanto não
          há acesso. Antes ele aparecia só depois do clique, empurrando a linha. */}
      {scoped && (
        <div style={{ marginTop: 10, opacity: enabled ? 1 : 0.45 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap',
          }}>
            <span className="overline">Enxerga</span>
            <SegmentedScope
              module={module as ScopedModule}
              value={scope}
              disabled={!enabled}
              onChange={onScope}
            />
          </div>
          {enabled && scope === 'OWN' && SCOPE_NOTE[module as ScopedModule] && (
            <p style={{
              fontSize: 'var(--text-2xs)', color: 'var(--text-faint)', marginTop: 5,
              textAlign: 'right', lineHeight: 'var(--leading-snug)',
            }}>
              {SCOPE_NOTE[module as ScopedModule]}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Pré-visualização ────────────────────────────────────────────────────────

function MenuPreview({ levels }: { levels: Levels }) {
  // A pré-visualização usa o estado NÃO salvo: é para conferir antes de gravar.
  const permissions = levels as ResolvedPermissions
  const network = menuLabelsFor(ADMIN_MENU, permissions)
  const branch  = menuLabelsFor(BRANCH_MENU, permissions)

  return (
    <div style={{
      marginTop: 22, padding: '14px 16px',
      background: 'var(--bg-app)', borderRadius: 'var(--radius-card-sm)',
      border: '1px solid var(--border)',
    }}>
      <span className="overline">O que essa pessoa vai ver</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        <PreviewLine title="Na unidade" items={branch} />
        <PreviewLine title="Na rede"    items={network} />
      </div>
    </div>
  )
}

function PreviewLine({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
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

function SegmentedLevel({ options, value, onChange }: {
  options: readonly PermissionLevel[]
  value: PermissionLevel
  onChange: (v: PermissionLevel) => void
}) {
  return (
    <div style={{ ...segFrame, flexShrink: 0 }}>
      {(['NONE', 'VIEW', 'MANAGE'] as const).map(lvl => {
        const available = options.includes(lvl)
        const active    = value === lvl
        return (
          <button
            key={lvl}
            type="button"
            disabled={!available}
            onClick={() => onChange(lvl)}
            title={available ? undefined : `${LEVEL_LABELS[lvl]} não se aplica a esta área`}
            style={{
              ...segItem(active),
              // Largura fixa mesmo quando o nível não existe para o módulo: sem
              // isto a coluna direita serrilha entre áreas de 2 e 3 níveis.
              width: 86,
              visibility: available ? 'visible' : 'hidden',
              cursor: available ? 'pointer' : 'default',
            }}
          >
            {LEVEL_LABELS[lvl]}
          </button>
        )
      })}
    </div>
  )
}

function SegmentedScope({ module, value, disabled, onChange }: {
  module: ScopedModule
  value: PermissionScope
  disabled: boolean
  onChange: (v: PermissionScope) => void
}) {
  const labels = SCOPE_LABELS[module]
  return (
    <div style={segFrame}>
      {(['OWN', 'ALL'] as const).map(s => (
        <button
          key={s}
          type="button"
          disabled={disabled}
          onClick={() => onChange(s)}
          style={{ ...segItem(value === s), padding: '4px 10px', fontSize: 'var(--text-2xs)' }}
        >
          {s === 'OWN' ? labels.own : labels.all}
        </button>
      ))}
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
              border: '1px solid #dc2626', background: '#fef2f2', color: '#dc2626', cursor: 'pointer',
            } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
