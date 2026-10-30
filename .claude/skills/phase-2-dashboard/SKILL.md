---
name: phase-2-dashboard
description: "เฟส 2 Dashboard KPI ด้วย Chart.js จาก action dashboard"
disable-model-invocation: true
effort: medium
---

อ่าน docs/PLAN.md แล้วทำ "เฟส 2B: Dashboard" ตาม PLAN §13 เสนอแผนก่อน

## ขอบเขต

- **`action=dashboard` ใน `gas/Api.js`:**
    - คำนวณที่ server แล้วคืนเฉพาะตัวเลขสรุป
    - ตรรกะการคำนวณอยู่ใน `gas/core/Kpi.js` พร้อมเทสต์
- **`web/dashboard.html`:**
    - ใช้ Chart.js จาก CDN
    - มีตัวกรองช่วงวันที่ ร้าน หมวด และช่าง
    - มีตัวเลขสรุป 4 ตัวด้านบน
    - กราฟตาม PLAN §13
    - ตารางงานเกินกำหนด
- **สิทธิ์:** เปิดได้เฉพาะ ADMIN และ VIEWER

## เกณฑ์ผ่าน

- [ ] ตัวเลขบน Dashboard ตรงกับการนับมือจากชีต (สุ่มตรวจ 3 ตัวเลข)
- [ ] ตัวกรองร้านและช่วงวันที่ทำให้ตัวเลขเปลี่ยนถูกต้อง
- [ ] ผู้ใช้ role STAFF เปิดหน้าแล้วได้ข้อความว่าไม่มีสิทธิ์
- [ ] `node --test` ผ่าน รวมเทสต์ของ `core/Kpi.js`

$ARGUMENTS
