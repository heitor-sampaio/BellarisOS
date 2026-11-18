-- ATD-P09 (varredura de conformidade de 18/11): o mapa de injetáveis é
-- clínico (CLAUDE.md §14: "Tela nova que mostra dado clínico sem
-- registrarAcessoAoProntuario"), e abrir o planejamento, a lista da cliente e
-- a lista da tela de Injetáveis não deixava registro de quem viu.
--
-- O registro (`prontuario_acessos`) ganha o ponto 'injetaveis' ("Planejamento
-- de injetáveis", `ROTULO_DO_PONTO` em lib/prontuario/acessos.ts). Sem esta
-- migration, o registro novo falha no check — e a falha vai ao log sem
-- trancar a tela (`tentar`): o código pode subir antes ou depois dela.

-- O check da coluna nasceu sem nome (20261027000001): sai o que houver nela.
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.prontuario_acessos'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%ponto%'
  loop
    execute format('alter table public.prontuario_acessos drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.prontuario_acessos add constraint prontuario_acessos_ponto_check
  check (ponto in ('ficha', 'sessao', 'plano', 'lgpd', 'injetaveis'));

notify pgrst, 'reload schema';
