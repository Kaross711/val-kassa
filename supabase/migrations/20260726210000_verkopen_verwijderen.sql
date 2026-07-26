-- Verkopen konden niet verwijderd worden: op receipts en receipt_items stond RLS
-- aan met alleen een select-policy. Een delete vanuit de browser (anon-key) gaf
-- dan HTTP 204 zonder fout, terwijl er nul rijen verdwenen — de knop leek te
-- werken maar deed niets.
--
-- Hier komt de delete-toestemming bij, in hetzelfde model als de rest van de app
-- (intern kassasysteem achter één gedeeld wachtwoord, toegang via anon-key).
-- Insert blijft ongewijzigd: verkopen worden aangemaakt via checkout_create.

alter table public.receipts      enable row level security;
alter table public.receipt_items enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'receipts' and policyname = 'receipts_delete'
    ) then
        create policy receipts_delete on public.receipts
            for delete to anon, authenticated using (true);
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'receipt_items' and policyname = 'receipt_items_delete'
    ) then
        create policy receipt_items_delete on public.receipt_items
            for delete to anon, authenticated using (true);
    end if;
end $$;

grant delete on public.receipts      to anon, authenticated;
grant delete on public.receipt_items to anon, authenticated;

-- Regels van een verkoop moeten meegaan met de bon zelf, anders blijft er een
-- wees-regel achter als de bon los verwijderd wordt.
do $$
declare
    fk_name text;
begin
    select con.conname into fk_name
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace ns on ns.oid = child.relnamespace
    where ns.nspname = 'public'
      and child.relname = 'receipt_items'
      and con.contype = 'f'
      and con.confrelid = 'public.receipts'::regclass
      and con.confdeltype <> 'c';   -- 'c' = cascade, die hoeft niet aangepast

    if fk_name is not null then
        execute format('alter table public.receipt_items drop constraint %I', fk_name);
        execute format(
            'alter table public.receipt_items add constraint %I
                 foreign key (receipt_id) references public.receipts(id) on delete cascade',
            fk_name
        );
    end if;
end $$;
