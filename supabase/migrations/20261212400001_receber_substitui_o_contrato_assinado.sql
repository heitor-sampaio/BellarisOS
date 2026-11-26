-- D1 da 33ª simulação (2026-11-26): o PDV recebeu Pix com 5% de desconto num
-- atendimento cujo contrato fora assinado para "crédito 3x", sem perguntar, e
-- o contrato seguiu assinado com o crédito 3x.
--
-- DG-03 do catálogo de Documentos: "Mudar o pagamento (ou o desconto) de um
-- contrato já assinado substitui o contrato, e a tela pergunta antes … Só
-- confirmado, o assinado vira substituído e nasce um novo para a cliente
-- assinar." O app pergunta (`contratoQueMudaNoReceber`, lib/pdv); confirmado,
-- manda o id do contrato assinado em `p_dados.substituir_contrato` e o
-- combinado de agora (`pagamentoNormalizado`) em `p_dados.retrato_do_contrato`.
-- A substituição vale JUNTO do dinheiro (CLAUDE.md §14: duas gravações que
-- precisam valer juntas, uma função): o `documento_substituir` de sempre (o do
-- plano) dentro desta transação, e o novo nasce com o retrato gravado — a
-- primeira tela que o abre o monta com ele.
--
-- Troca de trecho no corpo VIVO (pg_temp.trocar_no_corpo, com a conferência da
-- contagem), como em 20261130100007.

create or replace function pg_temp.trocar_no_corpo(p_fn regprocedure, p_de text[], p_para text[], p_vezes int[])
returns void language plpgsql as $f$
declare
  d text := pg_get_functiondef(p_fn);
  i int;
  n int;
begin
  for i in 1 .. array_length(p_de, 1) loop
    n := (length(d) - length(replace(d, p_de[i], ''))) / length(p_de[i]);
    if n <> p_vezes[i] then
      raise exception 'trecho % de %: achado % vez(es), esperado %', i, p_fn, n, p_vezes[i];
    end if;
    d := replace(d, p_de[i], p_para[i]);
  end loop;
  execute d;
end $f$;

select pg_temp.trocar_no_corpo(
  'public.confirmar_pagamento_do_atendimento(uuid,uuid,uuid,text,jsonb)'::regprocedure,
  array[
    $t$  v_ator      uuid;
$t$,
    $t$  v_ator := (select u.id from public.users u where u.id = p_ator);
$t$
  ],
  array[
    $t$  v_ator      uuid;
  v_contrato  uuid := nullif(p_dados ->> 'substituir_contrato', '')::uuid;
  v_doc_novo  uuid;
$t$,
    $t$  v_ator := (select u.id from public.users u where u.id = p_ator);

  -- D1 da 33ª (DG-03): o contrato assinado para outro pagamento, substituído
  -- com o recebimento (o app perguntou antes; esta é a resposta "Substituir").
  if v_contrato is not null then
    if not exists (select 1 from public.issued_documents d
                    where d.id = v_contrato and d.tenant_id = p_tenant and d.appointment_id = p_agendamento
                      and d.kind::text = 'CONTRATO' and d.status::text = 'ASSINADO') then
      raise exception 'O contrato a substituir não é o assinado deste atendimento. Abra a comanda de novo.' using errcode = 'P0001';
    end if;
    v_doc_novo := public.documento_substituir(v_contrato, p_tenant, v_ator);
    update public.issued_documents d
       set payment_snapshot = p_dados -> 'retrato_do_contrato'
     where d.id = v_doc_novo;
  end if;
$t$
  ],
  array[1, 1]
);

notify pgrst, 'reload schema';
