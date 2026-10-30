---
name: phase-1-core
description: "เฟส 1 ส่วนหลังบ้าน state machine สิทธิ์ routing API webhook การ์ด Flex"
disable-model-invocation: true
effort: high
---

อ่าน docs/PLAN.md แล้วทำ "เฟส 1A: หลังบ้านของ MVP"
เสนอแผนแบ่งเป็นงานย่อยก่อน แล้วทำและ commit ทีละงานย่อย
เฟสนี้ยังไม่ทำหน้า LIFF (ทำใน /phase-1-ui)

## ขอบเขต

- **`gas/core/Status.js`:** state machine ตาม PLAN §3 เฉพาะ action ของเฟส 1
    - ได้แก่ create, accept, reject, forward, reassign, checkin, close, ack
    - ฟังก์ชันหลักคือ `Status_transition()` ซึ่งต้องตรวจทั้งสถานะต้นทางและสิทธิ์ตาม PLAN §2
- **`gas/core/Routing.js`:** ตาม PLAN §10
- **`gas/core/JobId.js`:** สร้างเลขงาน
- **Unit test:** ครบทุก action ทั้งกรณีที่อนุญาตและกรณีที่ต้องถูกปฏิเสธ รวมถึงตารางสิทธิ์ตาม role
- **`gas/Repo.js`:** อ่านเขียนชีตตามชื่อหัวคอลัมน์ และครอบการเขียนด้วย LockService
- **`gas/Api.js` + `gas/Jobs.js`:** action ของเฟส 1 ตาม PLAN §6
    - me, register, createJob, getJob, listJobs, acceptJob, rejectJob, forwardJob, reassignJob, checkin, closeJob, ackJob
    - ตรวจสิทธิ์ทุก action
    - userId ต้องมาจาก ID token ที่ตรวจแล้วเท่านั้น
- **กดรับงานพร้อมกัน:** ตรวจสถานะซ้ำภายใต้ lock คนแรกได้งาน คนอื่นได้ CONFLICT
- **`gas/Webhook.js`:** ตาม PLAN §7
    - follow, unfollow
    - ข้อความที่เป็นเลขงาน
    - "งานของฉัน"
    - postback accept และ ack
- **`gas/Flex.js`:** การ์ด welcome, job_new, job_received, accept_result, job_rejected, job_done, ack_result ตาม PLAN §8 ใช้ reply ทุกจุดที่ตารางกำหนด
- **`gas/Drive.js`:** ตาม PLAN §12
- **`Dev_smokeTest(categoryCode)`:** ทำงานเฉพาะตอน ENV=test
    - สร้างงานตัวอย่างที่ผู้แจ้งคือ ADMIN คนแรก
    - ส่งการ์ด job_new ตาม routing
    - ใช้ทดสอบโดยยังไม่ต้องมีหน้า LIFF
- **รูปบนการ์ด Flex:** ทดสอบว่ารูปจาก Drive แสดงได้หรือไม่ ถ้าไม่ได้ให้ตัดรูปออกจากการ์ด แล้วจดผลใน PLAN §18

**ยังไม่ทำในเฟสนี้:** ขอเลื่อน, แก้ความเร่งด่วน, ยกเลิก, เตือน SLA, Dashboard, ย้ายข้อมูลเก่า

## เกณฑ์ผ่าน

- [ ] `node --test` ผ่าน และมีเทสต์การเปลี่ยนสถานะที่ไม่อนุญาตกับเทสต์สิทธิ์ตาม role
- [ ] รัน `Dev_smokeTest('ELEC')` ใน editor แล้ว TECH ได้การ์ด job_new ใน LINE
- [ ] กด "รับงาน" แล้วได้ reply ว่ารับงานแล้ว ชีตขึ้น ACCEPTED มี accepted_at และมีแถวใน JobLog
- [ ] กด "รับงาน" ซ้ำหรือกดจากบัญชีที่สอง ต้องได้ข้อความว่ามีคนรับแล้ว
- [ ] รัน `Dev_smokeTest('KITCHEN')` แล้วการ์ดไปหา ADMIN
- [ ] จดผลการแสดงรูปบนการ์ด Flex ลง PLAN §18
- [ ] WebhookLog มีแถวเพิ่มเฉพาะตอน ENV=test

$ARGUMENTS
