-- Fix: cộng bù phép tháng 6/2026 bị thiếu cho các NV bị ảnh hưởng bởi bug accrual.
--
-- Root cause: accrual T6 chạy trước accrual T5 (T6 được view trước T5).
-- Khi đó T5 được compute với _preventAccrual=true + leave_balance chưa include
-- T5's +1, dẫn đến prevBalanceEnd(T5) thiếu 1 → balanceStart(T6) = T5_balance thay
-- vì T5_balance + 1.
--
-- Detection: NV có last_accrual_month='2026-06' VÀ log T6 có balance_after
-- nhỏ hơn log T5 + 1 (tức T6 không được cộng đúng +1 so với cuối T5).
--
-- Fix: cộng thêm phần thiếu vào leave_balance, ghi log correction.

-- ============================================================
-- BƯỚC 1: XEM TRƯỚC — ai bị ảnh hưởng (chạy trước để verify)
-- ============================================================
-- Uncomment và chạy riêng để xem danh sách trước khi fix:
--
-- WITH t5 AS (
--   SELECT DISTINCT ON (employee_id) employee_id, balance_after
--   FROM leave_balance_log
--   WHERE event_type = 'accrual'
--     AND note = 'Cộng phép tháng 2026-05 (tự động)'
--   ORDER BY employee_id, changed_at DESC
-- ),
-- t6 AS (
--   SELECT DISTINCT ON (employee_id) employee_id, balance_after
--   FROM leave_balance_log
--   WHERE event_type = 'accrual'
--     AND note = 'Cộng phép tháng 2026-06 (tự động)'
--   ORDER BY employee_id, changed_at DESC
-- )
-- SELECT
--   e.name, e.email,
--   e.leave_balance AS current_balance,
--   t5.balance_after AS t5_start,
--   t6.balance_after AS t6_start,
--   t5.balance_after + 1 AS t6_expected,
--   (t5.balance_after + 1 - t6.balance_after) AS missing_delta
-- FROM employees e
-- JOIN t6 ON t6.employee_id = e.id
-- JOIN t5 ON t5.employee_id = e.id
-- WHERE e.employment_type = 'fulltime'
--   AND e.last_accrual_month = '2026-06'
--   AND t6.balance_after < t5.balance_after + 1
-- ORDER BY e.name;

-- ============================================================
-- BƯỚC 2: FIX — cộng bù leave_balance cho NV bị thiếu
-- ============================================================

WITH t5 AS (
  SELECT DISTINCT ON (employee_id) employee_id, balance_after
  FROM leave_balance_log
  WHERE event_type = 'accrual'
    AND note = 'Cộng phép tháng 2026-05 (tự động)'
  ORDER BY employee_id, changed_at DESC
),
t6 AS (
  SELECT DISTINCT ON (employee_id) employee_id, balance_after
  FROM leave_balance_log
  WHERE event_type = 'accrual'
    AND note = 'Cộng phép tháng 2026-06 (tự động)'
  ORDER BY employee_id, changed_at DESC
),
affected AS (
  SELECT
    e.id AS employee_id,
    (t5.balance_after + 1 - t6.balance_after) AS delta
  FROM employees e
  JOIN t6 ON t6.employee_id = e.id
  JOIN t5 ON t5.employee_id = e.id
  WHERE e.employment_type = 'fulltime'
    AND e.last_accrual_month = '2026-06'
    AND t6.balance_after < t5.balance_after + 1
)
UPDATE employees
SET leave_balance = employees.leave_balance + affected.delta
FROM affected
WHERE employees.id = affected.employee_id;

-- Ghi log correction (chạy ngay sau UPDATE ở trên)
WITH t5 AS (
  SELECT DISTINCT ON (employee_id) employee_id, balance_after
  FROM leave_balance_log
  WHERE event_type = 'accrual'
    AND note = 'Cộng phép tháng 2026-05 (tự động)'
  ORDER BY employee_id, changed_at DESC
),
t6 AS (
  SELECT DISTINCT ON (employee_id) employee_id, balance_after
  FROM leave_balance_log
  WHERE event_type = 'accrual'
    AND note = 'Cộng phép tháng 2026-06 (tự động)'
  ORDER BY employee_id, changed_at DESC
)
INSERT INTO leave_balance_log (employee_id, delta, balance_after, event_type, note)
SELECT
  e.id,
  (t5.balance_after + 1 - t6.balance_after),
  e.leave_balance,  -- leave_balance đã được UPDATE ở trên
  'manual_correction',
  'Fix: cộng bù phép T6/2026 bị thiếu do accrual chạy trước T5'
FROM employees e
JOIN t6 ON t6.employee_id = e.id
JOIN t5 ON t5.employee_id = e.id
WHERE e.employment_type = 'fulltime'
  AND e.last_accrual_month = '2026-06'
  AND t6.balance_after < t5.balance_after + 1;
