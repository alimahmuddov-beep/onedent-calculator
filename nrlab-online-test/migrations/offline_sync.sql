-- NRLAB TEST CLOUD only. Apply to the isolated project, not to production.
-- Adds a client UUID for deduplicating offline order submissions.
alter table public.orders add column if not exists client_submission_id uuid;
create unique index if not exists orders_client_submission_id_uniq
 on public.orders(client_submission_id) where client_submission_id is not null;

create or replace function public.place_order_idempotent(
 p_client_id uuid, p_clinic_id uuid, p_patient text, p_shade text,
 p_due date, p_notes text, p_items jsonb
) returns uuid
language plpgsql security invoker set search_path=''
as $$
declare old_order public.orders;
declare new_id uuid;
declare item jsonb; declare code text; declare tooth text; declare quantity int;
begin
 if (select auth.uid()) is null or not (select nrlab_private.is_approved()) then
   raise exception 'Account not approved';
 end if;
 if p_client_id is null then raise exception 'Missing client submission identifier'; end if;
 perform pg_advisory_xact_lock(hashtext(p_client_id::text)::bigint);
 select * into old_order from public.orders where client_submission_id=p_client_id;
 if found then
   if old_order.created_by <> (select auth.uid()) then
     raise exception 'Submission identifier belongs to another user';
   end if;
   return old_order.id;
 end if;
 if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>64 then
   raise exception 'Order needs 1-64 work entries';
 end if;
 if length(btrim(coalesce(p_patient,''))) not between 1 and 120
    or length(coalesce(p_notes,''))>2000 or length(coalesce(p_shade,''))>30 then
   raise exception 'Invalid order fields';
 end if;
 insert into public.orders(clinic_id,created_by,patient_code,shade,due_date,notes,doctor_name,client_submission_id)
 values(p_clinic_id,(select auth.uid()),btrim(p_patient),coalesce(p_shade,''),p_due,coalesce(p_notes,''),
   (select full_name from public.profiles where id=(select auth.uid())),p_client_id)
 returning id into new_id;
 for item in select * from jsonb_array_elements(p_items) loop
   code=item->>'work_code';tooth=coalesce(item->>'tooth','');
   if length(tooth)>12 or (tooth<>'' and tooth !~ '^[1-4][1-8]$') then
     raise exception 'Invalid tooth';
   end if;
   quantity=coalesce((item->>'qty')::int,1);
   if quantity<1 or quantity>99 then raise exception 'Invalid quantity'; end if;
   insert into public.order_items(order_id,work_code,tooth,qty) values(new_id,code,tooth,quantity);
 end loop;
 return new_id;
end
$$;
revoke all on function public.place_order_idempotent(uuid,uuid,text,text,date,text,jsonb) from public,anon;
grant execute on function public.place_order_idempotent(uuid,uuid,text,text,date,text,jsonb) to authenticated;
