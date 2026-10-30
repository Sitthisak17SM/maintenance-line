---
name: phase-2-core
description: "เฟส 2 คุมเวลา ขอเลื่อน แก้ความเร่งด่วน ยกเลิก เตือน SLA ย้ายข้อมูลเก่า และ environment prod"
disable-model-invocation: true
effort: high
---

อ่าน docs/PLAN.md แล้วทำ "เฟส 2A: คุมเวลาและข้อมูล" เสนอแผนก่อน

## ขอบเขต

- **ขอเลื่อน:** `requestExtension` และ `decideExtension` ตาม PLAN §3 และ §8
    - ช่างขอเลื่อนผ่านฟอร์มใน `job.html`
    - อนุมัติได้ 2 ทาง คือปุ่มในแชท (postback `ext_ok` / `ext_no`) และใน `admin.html`
- **`setPriority` และ `cancelJob`:** ทำใน `admin.html` และให้ JobLog เก็บค่าเดิมกับค่าใหม่
- **`Sla_tick` + `Triggers_install`:** ตาม PLAN §11
    - เตือนแบบรวมข้อความต่อคนต่อรอบ
    - ทำ auto_ack ตามค่าใน Config
    - เพิ่มเทสต์ `Sla_pendingAlerts`
- **`Setup_migrateLegacy`:** ตาม PLAN §14 ทดสอบกับสำเนาชีตเก่าก่อนเสมอ
- **environment prod และ workflow:** ตาม PLAN §16 การ deploy ไป prod ต้องกดเอง
- **ถ้าเวลาพอ:** ทดสอบวิดีโอแนบแล้วเสนอค่า `VIDEO_MAX_MB`

## เกณฑ์ผ่าน

- [ ] ช่างขอเลื่อนพร้อมเหตุผลและวันใหม่ พี่แตงกวากดอนุมัติในแชทแล้ว due_at เปลี่ยน และช่างได้แจ้งเตือน
- [ ] Admin เปลี่ยน Emergency เป็น Urgent แล้ว response_due_at กับ due_at คำนวณใหม่ และ JobLog มีค่าเดิมกับค่าใหม่
- [ ] งานที่เลย SLA ทำให้พี่แตงกวาได้ข้อความเดียวที่รวมทุกงานภายใน 15 นาที และรอบถัดไปไม่เตือนซ้ำ
- [ ] ย้ายข้อมูลเก่าได้ 171 แถว และรันซ้ำแล้วไม่เพิ่มแถวซ้ำ
- [ ] push ขึ้น main แล้ว deploy ไป test ส่วน prod ต้องกด workflow_dispatch เท่านั้น
- [ ] `node --test` ผ่าน

$ARGUMENTS
