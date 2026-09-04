-- A later online check-in continues a workday that was already started at the
-- office. Clear historical late minutes for this split-location pattern.
update public.check_ins as online_ci
set late_minutes = null
where online_ci.kind = 'in'
  and online_ci.late_minutes > 0
  and online_ci.selfie_path is null
  and online_ci.latitude is null
  and online_ci.longitude is null
  and exists (
    select 1
    from public.check_ins as office_ci
    where office_ci.employee_id = online_ci.employee_id
      and office_ci.kind = 'in'
      and office_ci.checked_in_at < online_ci.checked_in_at
      and (office_ci.checked_in_at at time zone 'Asia/Ho_Chi_Minh')::date =
          (online_ci.checked_in_at at time zone 'Asia/Ho_Chi_Minh')::date
      and office_ci.selfie_path is not null
  );
