import type { AppModule, PermissionLevel, ScopedModule } from '@estetica-os/types'

/**
 * Textos da tela de cargos — o que cada escolha significa para quem administra
 * a clínica.
 *
 * Vive separado de `lib/permissions.ts` de propósito: aquele arquivo entra no
 * caminho de autorização de toda requisição, e isto aqui é só copy de uma tela.
 *
 * O hint fixo por módulo que existia antes não dizia a diferença entre "Ver" e
 * "Gerenciar" — em Financeiro os dois liam "Lançamentos, relatórios, estorno e
 * comissões", quando a diferença real é poder estornar. Daí a frase ser por
 * (módulo, nível).
 */

// ─── Agrupamento por área do dia a dia ───────────────────────────────────────
// A ordem técnica de APP_MODULES não serve para a tela: deixava `roles` e
// `settings`, os dois mais perigosos, por último e com a mesma tipografia de
// "Estoque".

export type ModuleGroup = {
  key:     string
  label:   string
  hint:    string
  modules: readonly AppModule[]
}

export const MODULE_GROUPS: readonly ModuleGroup[] = [
  {
    key:     'atendimento',
    label:   'Atendimento',
    hint:    'O dia a dia com o cliente na unidade',
    modules: ['agenda', 'clients', 'medical_records'],
  },
  {
    key:     'vendas',
    label:   'Vendas e marketing',
    hint:    'Captação, negociação e fechamento',
    modules: ['crm', 'procedures', 'marketing'],
  },
  {
    key:     'dinheiro',
    label:   'Dinheiro e estoque',
    hint:    'O que entra, o que sai e o que tem em casa',
    modules: ['cashier', 'financial', 'stock'],
  },
  {
    key:     'gestao',
    label:   'Gestão e configuração',
    hint:    'Números da rede e quem pode o quê',
    modules: ['reports', 'team', 'forms', 'roles', 'settings'],
  },
]

// ─── O que cada nível libera, em português de dona de clínica ────────────────

const SEM_ACESSO = 'Não aparece para esta pessoa.'

export const LEVEL_COPY: Record<AppModule, Partial<Record<PermissionLevel, string>>> = {
  agenda: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre a agenda, inicia e conclui atendimentos e escreve as anotações da sessão.',
    MANAGE: 'Tudo do Ver, mais marcar, remarcar, cancelar, marcar falta, fazer check-in e trocar o profissional do horário.',
  },
  clients: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre a lista de clientes e a ficha completa: histórico, compras, pagamentos e documentos.',
    MANAGE: 'Tudo do Ver, mais cadastrar cliente novo, editar dados, anexar documentos e inativar cliente.',
  },
  medical_records: {
    NONE:   SEM_ACESSO,
    VIEW:   'Lê a anamnese, a evolução clínica e as fotos do cliente.',
    MANAGE: 'Tudo do Ver, mais preencher e salvar anamnese, evolução e fotos, e liberar a parte clínica em pedidos de LGPD.',
  },
  procedures: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê a tabela de procedimentos e preços, os pacotes do cliente e a fila de fechamentos.',
    MANAGE: 'Tudo do Ver, mais criar e precificar procedimento, montar orçamento, colher assinatura do termo e fechar a venda do pacote.',
  },
  stock: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê produtos, saldo por unidade, alertas de estoque baixo e histórico de movimentação.',
    MANAGE: 'Tudo do Ver, mais cadastrar produto, dar entrada e baixa, ajustar inventário e transferir entre unidades.',
  },
  financial: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê faturamento, despesas, extrato de lançamentos e comissões.',
    MANAGE: 'Tudo do Ver, mais lançar receita e despesa, estornar e conceder crédito ao cliente.',
  },
  cashier: {
    NONE:   SEM_ACESSO,
    MANAGE: 'Abre e fecha o caixa do dia e recebe os pagamentos dos atendimentos. Não lança despesa nem estorna — isso é Financeiro.',
  },
  crm: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê o funil de leads, abre os cards e lê as conversas de WhatsApp.',
    MANAGE: 'Tudo do Ver, mais criar e mover leads, responder no WhatsApp, configurar as etapas do funil e agendar direto pelo CRM.',
  },
  marketing: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê o painel de anúncios: quanto foi investido, retorno e leads que vieram de cada campanha.',
    MANAGE: 'Tudo do Ver, mais criar, ativar, pausar e arquivar as campanhas de notificação.',
  },
  reports: {
    NONE:   SEM_ACESSO,
    VIEW:   'Abre os relatórios da rede inteira: financeiro, agenda, clientes, procedimentos, profissionais e estoque.',
  },
  team: {
    NONE:   SEM_ACESSO,
    VIEW:   'Vê quem trabalha na unidade, com cargo e situação.',
    MANAGE: 'Tudo do Ver, mais cadastrar e editar pessoas, definir o cargo de cada uma e desativar quem sai.',
  },
  forms: {
    NONE:   SEM_ACESSO,
    MANAGE: 'Monta os modelos de ficha de anamnese e de atendimento que os profissionais preenchem. Preencher a ficha do cliente é Prontuário.',
  },
  roles: {
    NONE:   SEM_ACESSO,
    MANAGE: 'Cria cargos e define o que cada um acessa — inclusive o próprio.',
  },
  settings: {
    NONE:   SEM_ACESSO,
    MANAGE: 'Cadastra e edita unidades, conecta WhatsApp e contas de anúncio, e trata os pedidos de LGPD.',
  },
}

// ─── Alcance ("Enxerga") ─────────────────────────────────────────────────────
// Nota extra só onde "só os próprios" tem consequência que o rótulo curto não
// entrega. No financeiro, por exemplo, o alcance próprio não filtra a tela: ela
// se reduz à lista de comissões.

export const SCOPE_NOTE: Partial<Record<ScopedModule, string>> = {
  financial: 'Com alcance próprio a tela vira só "minhas comissões": some faturamento, despesas e extrato — e não dá para lançar, mesmo com Gerenciar.',
  agenda:    'Com alcance próprio a pessoa consegue iniciar e concluir os atendimentos dela, mas não cancela nem marca falta.',
}

// ─── Cargos sensíveis ────────────────────────────────────────────────────────
// Dois caminhos de auto-elevação. O aviso é uma linha na própria opção, não um
// banner: quem está montando o cargo precisa saber, não levar susto.

export const SENSITIVE_NOTE: Partial<Record<AppModule, string>> = {
  roles: 'Quem tem isto pode conceder a si mesmo qualquer outro acesso.',
  team:  'Permite atribuir a alguém um cargo mais poderoso que o próprio.',
}
