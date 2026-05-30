-- Reset last_accrual_month về tháng hiện tại cho NV fulltime đang có
-- last_accrual_month set vào tháng TƯƠNG LAI (do nút "Cộng phép tháng" cũ
-- được bấm trước khi tháng đó bắt đầu).
-- Điều này đảm bảo: khi xem bảng lương tháng kế tiếp, hệ thống sẽ tính
-- balanceStart = balanceEnd(tháng hiện tại) + 1, thay vì dùng thẳng leave_balance.

UPDATE employees
SET last_accrual_month = '2026-05'
WHERE employment_type = 'fulltime'
  AND last_accrual_month > '2026-05';
