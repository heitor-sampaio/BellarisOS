-- O "Documento" da cliente tem TIPO: CPF, Passaporte ou RNE (D-11, decisão do
-- Heitor, frente de cadastro de 2026-10-29). A estrangeira sem CPF não tinha
-- como entrar com documento nenhum.
--
-- O CPF CONTINUA em `clients.document`, sozinho: a unicidade por rede
-- (`@@unique([tenantId, document])`), a senha inicial do app
-- (lib/clients/acesso.ts) e `login_de_cliente_para_ligar` (o mesmo CPF liga a
-- ficha à conta que ela já tem) leem o CPF dali e não mudam. Passaporte e RNE
-- moram em colunas próprias — guardá-los em `document` faria cada leitor do CPF
-- tratar "AB123456" como CPF (a senha, o contrato, a ligação de contas).
-- A ficha tem um OU outro: quem grava é o app (`documentoDaFicha`).

alter table public.clients
  add column if not exists documento_tipo   text,
  add column if not exists documento_numero text;

alter table public.clients drop constraint if exists clients_documento_estrangeiro;
alter table public.clients add constraint clients_documento_estrangeiro check (
  (documento_tipo is null) = (documento_numero is null)
  and (documento_tipo is null or documento_tipo in ('PASSAPORTE', 'RNE'))
);

-- Um passaporte (ou RNE) por rede, como o CPF.
create unique index if not exists clients_documento_estrangeiro_unico
  on public.clients (tenant_id, documento_tipo, documento_numero)
  where documento_numero is not null;

comment on column public.clients.documento_tipo is
  'Documento de quem não tem CPF: PASSAPORTE ou RNE (D-11, 2026-10-29). Nulo = o documento é o CPF em document (ou não há). Sem CPF, a cliente não tem acesso ao app (a senha inicial é o CPF).';
comment on column public.clients.documento_numero is
  'O número do passaporte ou do RNE, em maiúsculas e sem espaço (documentoEstrangeiro, @estetica-os/utils).';

notify pgrst, 'reload schema';
