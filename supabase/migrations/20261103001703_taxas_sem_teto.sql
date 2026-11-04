-- F16-3 (F17; o Heitor, revisão das decisões da F16: "não é pra recusar nada,
-- juros podem passar facilmente de 100% no acumulado"). As taxas da
-- maquininha não têm teto — só não são negativas. A da BANDEIRA mora num jsonb
-- (`tenants.cartao_por_bandeira`) sem teto no banco; a da REGRA GERAL mora em
-- `payment_fees.taxa_pct`, que tem o CHECK de 0 a 100.
--
-- Sem mexer no CHECK (tirá-lo é comando destrutivo, que esta frente não
-- aplica — o SQL está no relatório da F17): a coluna nova `taxa_pct_sem_teto`
-- guarda a taxa como a clínica digitou, e um gatilho BEFORE (que roda antes do
-- CHECK) a preenche e deixa em `taxa_pct` o valor até 100, para o CHECK de
-- sempre. `comissao_taxas_definir` não muda (segue gravando `taxa_pct`). A
-- taxa que vale é `coalesce(taxa_pct_sem_teto, taxa_pct)` — em
-- private.taxa_geral_exata, e no app (a tela e o aviso). Tirado o CHECK, a
-- coluna nova pode virar a única.
--
-- O que acontece acima de 100%: a comissão sobre o líquido já não fica
-- negativa (`comissao_conta`: greatest(base, 0)); a estimativa do Fechamento
-- é só informativa; e o depósito previsto da operadora não fica abaixo de zero
-- — na lista das parcelas (recebiveis_do_cartao_lista) o líquido é no mínimo
-- R$ 0 e a taxa, no máximo a parcela inteira.

alter table public.payment_fees add column if not exists taxa_pct_sem_teto numeric
  constraint payment_fees_taxa_pct_sem_teto_nao_negativa check (taxa_pct_sem_teto is null or taxa_pct_sem_teto >= 0);

comment on column public.payment_fees.taxa_pct_sem_teto is
  'F16-3: a taxa como a clínica digitou, sem teto (pode passar de 100%). taxa_pct fica com até 100 (o CHECK antigo). A que vale: coalesce(taxa_pct_sem_teto, taxa_pct).';

create or replace function private.payment_fees_sem_teto()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' or new.taxa_pct is distinct from old.taxa_pct then
    new.taxa_pct_sem_teto := new.taxa_pct;
    new.taxa_pct := least(new.taxa_pct, 100);
  end if;
  return new;
end
$$;

create or replace trigger trg_payment_fees_sem_teto
  before insert or update on public.payment_fees
  for each row execute function private.payment_fees_sem_teto();

update public.payment_fees set taxa_pct_sem_teto = taxa_pct where taxa_pct_sem_teto is null;

create or replace function private.taxa_geral_exata(p_tenant uuid, p_metodo text, p_parcelas integer)
returns numeric
language sql
stable security definer
set search_path to ''
as $$
  select coalesce(f.taxa_pct_sem_teto, f.taxa_pct)
    from public.payment_fees f
   where f.tenant_id = p_tenant and f.metodo = p_metodo
     and f.parcelas = case when p_metodo = 'CREDIT_CARD'
                           then greatest(1, least(12, coalesce(p_parcelas, 1))) else 1 end
   limit 1
$$;

create or replace function public.recebiveis_do_cartao_lista(p_tenant uuid, p_branch_ids uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
 returns table(id uuid, branch_id uuid, transaction_id uuid, descricao text, cliente_nome text, parcela_numero smallint, parcela_total smallint, valor numeric, valor_original numeric, estornado numeric, taxa_pct numeric, taxa numeric, liquido numeric, vencimento timestamp with time zone, vencimento_dia date, situacao text, recebida_na timestamp with time zone)
 language sql
 stable
 set search_path to ''
as $function$
  select r.id, r.branch_id, r.transaction_id, t.description, c.name,
         r.parcela_numero, r.parcela_total, r.valor, r.valor_original,
         -- F16-3: com a taxa acima de 100%, a operadora não deposita menos que zero.
         r.estornado, r.taxa_pct, least(r.taxa, r.valor), greatest(r.liquido, 0),
         r.vencimento, (r.vencimento at time zone 'America/Sao_Paulo')::date,
         case when r.cancelada_em is not null then 'CANCELADA'
              when r.estornada_em is not null then 'ESTORNADA'
              when r.recebida_em is not null and r.recebida_em < r.vencimento then 'ANTECIPADA'
              when r.recebida_em is not null or r.vencimento <= now() then 'RECEBIDA'
              else 'A_RECEBER' end,
         case when r.cancelada_em is not null then null
              when r.recebida_em is not null then r.recebida_em
              when r.vencimento <= now() then r.vencimento end
    from public.recebiveis_do_cartao r
    join public.financial_transactions t on t.id = r.transaction_id
    left join public.clients c on c.id = t.client_id
   where r.tenant_id = p_tenant
     and (p_branch_ids is null or r.branch_id = any (p_branch_ids))
     and (p_from is null or r.vencimento >= p_from)
     and (p_to   is null or r.vencimento <= p_to)
   order by r.vencimento, r.transaction_id, r.parcela_numero
$function$;

notify pgrst, 'reload schema';
