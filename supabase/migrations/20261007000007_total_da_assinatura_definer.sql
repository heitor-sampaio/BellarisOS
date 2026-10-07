-- O gatilho do total (20261007000006) roda com o papel de quem grava (o
-- servidor, service role), que não tem uso do esquema private: chamar
-- private.valor_com_condicao dava "permission denied for schema private".
-- Como o gatilho do limite, roda como dono.
alter function private.total_da_assinatura() security definer;
