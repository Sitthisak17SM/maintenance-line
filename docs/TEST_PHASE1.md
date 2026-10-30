# TEST_PHASE1: แผนทดสอบเฟส 1 (หลังบ้าน 1A + หน้า LIFF 1B)

เอกสารนี้เขียนให้ agent ที่มาทดสอบ (เช่น Codex) อ่านแล้วทำตามได้เลย อ่าน `CLAUDE.md` และ `docs/PLAN.md` ก่อน

## กติกา (ห้ามฝ่าฝืน)

- **ห้ามขอหรือพิมพ์ความลับ:** token, `WEBHOOK_KEY`, `~/.clasprc.json` และค่าใน Script Properties ห้ามแสดงในผลรายงาน
- **ห้ามแก้ข้อมูลที่ไม่ใช่ชีตทดสอบ:** ใช้ได้เฉพาะชีต `Maintenance LINE (test)` ด้านล่าง ห้ามลบแถวที่ไม่ได้สร้างเอง
- **ห้าม deploy:** ห้ามรัน `clasp push`, `clasp update-deployment` หรือ `workflow_dispatch target=prod` ถ้าเจอ bug ให้รายงานพร้อมวิธีแก้ ไม่ต้องแก้เอง
- **ห้าม push ขึ้น `main`:** ถ้าจะเพิ่มไฟล์ทดสอบ ให้ทำใน branch แยก

## ค่าของระบบทดสอบ (ไม่ใช่ความลับ)

| รายการ | ค่า |
|---|---|
| Repo | https://github.com/Sitthisak17SM/maintenance-line |
| Web (GitHub Pages) | https://sitthisak17sm.github.io/maintenance-line/ |
| API_URL (Apps Script `/exec`) | ดูใน `web/js/config.js` |
| LIFF_ID | ดูใน `web/js/config.js` |
| ชีตทดสอบ | `18echl9dE6gddXm2Ji5PRHnMHcw0tGXpxB3DT5wrlFro` |
| OA ทดสอบ | `@475lnsdz` |

## ส่วน A: agent ทดสอบเองได้

### A1. Unit test

```bash
node --test
```

เกณฑ์ผ่าน: ไม่มี fail และต้องมีเทสต์ครบตาม PLAN §17 คือ
- การเปลี่ยนสถานะทั้งที่อนุญาตและที่ต้องถูกปฏิเสธ ทุก action ของเฟส 1 ได้แก่ create, accept, reject, forward, reassign, checkin, close, ack
- สิทธิ์ตาม role ทั้ง STAFF, MANAGER, TECH, ADMIN, VIEWER
- routing ตาม §10
- เลขงานและการรีเซ็ตเลขเมื่อขึ้นเดือนใหม่
- SLA

รายงานข้อที่ PLAN กำหนดไว้แต่ยังไม่มีเทสต์

### A2. ตรวจ syntax

```bash
for f in gas/*.js gas/core/*.js web/js/*.js; do node --check "$f" || echo "FAIL $f"; done
```

สคริปต์ inline ใน `web/*.html` ต้อง parse ผ่านด้วย ใช้ `vm.Script` ของ Node ตรวจทีละ `<script>` ที่ไม่มี `src`

### A3. API smoke test (ไม่ต้องมี token)

```bash
API=$(node -e "const s=require('fs').readFileSync('web/js/config.js','utf8');console.log(s.match(/API_URL:\s*'([^']+)'/)[1])")
curl -sL -H 'Content-Type: text/plain;charset=utf-8' -d '{"action":"ping"}' "$API"
curl -sL -H 'Content-Type: text/plain;charset=utf-8' -d '{"action":"me"}' "$API"
curl -sL -H 'Content-Type: text/plain;charset=utf-8' -d '{"action":"createJob","data":{"title":"x"}}' "$API"
curl -sL -H 'Content-Type: text/plain;charset=utf-8' -d '{"action":"acceptJob","idToken":"fake","data":{"job_id":"MT-2610-0001"}}' "$API"
curl -sL -H 'Content-Type: text/plain;charset=utf-8' -d '{"action":"nope"}' "$API"
curl -sL -o /dev/null -w '%{http_code}\n' -d '{"events":[]}' "$API?key=wrong"
```

| คำขอ | ผลที่ต้องได้ |
|---|---|
| ping | `{"ok":true,"data":{"pong":true,...}}` |
| me ไม่มี token | `ok:false`, `code:"AUTH"` |
| createJob ไม่มี token | `code:"AUTH"` และต้องไม่มีแถวใหม่ใน Jobs |
| acceptJob ด้วย token ปลอม | `code:"AUTH"` |
| action ที่ไม่มีอยู่ | `code:"VALIDATION"` |
| webhook ด้วย key ผิด | HTTP 200 และต้องไม่มีแถวใหม่ใน WebhookLog |

### A4. หน้า LIFF ในเบราว์เซอร์ (จำลอง LIFF กับ API)

เปิดหน้าจากไฟล์ในเครื่อง (`file:///.../web/<page>.html`) ด้วย Playwright โดยตั้งความกว้างแบบมือถือ 390 px และดัก request 2 แบบ
- `https://static.line-scdn.net/**` ให้ตอบเป็น LIFF ปลอม:
  `window.liff={init:async()=>{},isLoggedIn:()=>true,getIDToken:()=>'t',isInClient:()=>false,getContext:()=>({type:'none'}),login(){},closeWindow(){},sendMessages:async()=>{}}`
- `https://script.google.com/**` ให้อ่าน `action` จาก body แล้วตอบ `{ok:true,data:...}` ตามรูปแบบที่ `gas/Jobs.js` คืนค่า (ดู `Jobs_me`, `Jobs_get`, `Jobs_list`)

ตรวจทุกหน้า: `register.html`, `report.html`, `job.html?id=X`, `job.html?id=X&do=reject`, `jobs.html`, `admin.html`, `admin.html?id=X`

| ตรวจ | เกณฑ์ |
|---|---|
| console | ไม่มี `pageerror` และไม่มี console error ยกเว้นรูปจาก URL ปลอมที่โหลดไม่ได้ |
| XSS | ตั้ง title เป็น `<b>x</b>` แล้วหน้าต้องแสดงเป็นข้อความตามตัวอักษร ห้ามตีความเป็น HTML |
| report | เลือก Area "อื่นๆ" แล้วช่องพิมพ์ต้องโผล่มา กดส่งตอนข้อมูลยังไม่ครบต้องขึ้นข้อความเตือนภาษาไทย |
| job ปุ่ม | ปุ่มที่แสดงต้องตรงกับ `allowed_actions` ที่ API ส่งมาเท่านั้น ลองส่งค่า `[]` แล้วต้องไม่มีหัวข้อ "ดำเนินการ" |
| job `&do=reject` | ฟอร์มเหตุผลปฏิเสธต้องเปิดเอง |
| ฟอร์มปิดงาน | ยอดรวมของอะไหล่ต้องเท่ากับผลรวม qty × ราคา, ไม่มีรูป After ต้องไม่ให้ส่ง, ติ๊ก "ไม่มีคนอยู่หน้างาน" แต่ไม่กรอกหมายเหตุต้องไม่ให้ส่ง |
| jobs | แท็บ scope ต้องแสดงตาม role ลอง `me.user.role` = STAFF, TECH, MANAGER, ADMIN |
| admin | role ที่ไม่ใช่ ADMIN ต้องขึ้นข้อความ "หน้านี้สำหรับ Admin เท่านั้น" |
| register `next` | `register.html?next=https://evil.example` ลงทะเบียนเสร็จแล้วต้องไม่ redirect ออกนอกเว็บ |

ให้แนบ screenshot ของ `job.html` ตอนเปิดฟอร์มปิดงาน และของ `report.html` ไว้ในรายงานด้วย

### A5. Review โค้ดเทียบกับ PLAN

ตรวจ 7 จุดนี้แล้วรายงานพร้อม `ไฟล์:บรรทัด`
1. ทุก API action ใน PLAN §6 เฟส 1 มีอยู่ใน `gas/Api.js` และตรวจสิทธิ์ก่อนเขียนชีตทุกครั้ง
2. userId ที่ใช้ต้องมาจาก `Line_verifyIdToken` หรือจาก webhook ที่ผ่าน key แล้วเท่านั้น ห้ามใช้ userId จาก `data`
3. การเปลี่ยนสถานะทุกจุดต้องผ่าน `Status_transition()` และเขียน JobLog
4. การเขียนชีตทุกจุดอยู่ใน `Repo_withLock` และ accept ตรวจสถานะซ้ำภายใต้ lock
5. ใช้ reply และ push ตามตาราง PLAN §8 ห้ามมี push ที่ตารางไม่ได้กำหนด
6. `gas/core/` ต้องไม่เรียก `SpreadsheetApp`, `UrlFetchApp` หรือบริการอื่นของ Google
7. `web/` ต้องไม่มีความลับ

## ส่วน B: ต้องมีคนกดในแอป LINE แล้ว agent ตรวจผลในชีต

agent ให้คนทำตามขั้นตอนทีละข้อ หลังคนทำแต่ละข้อเสร็จ agent อ่านชีตทดสอบเพื่อยืนยันผล ถ้ามี Google Sheets connector ก็ใช้ได้ ถ้าไม่มีให้ขอภาพหน้าจอ

**การเตรียม:** ในแท็บ Users ต้องมี ADMIN ที่ active 1 คน และ TECH ที่ active 1 คน ถ้าทดสอบด้วยบัญชีเดียว ให้ใส่ userId เดียวกัน 2 แถว ระบบจะใช้**แถวแรก**เป็นตัวตนตอนกดปุ่ม จึงต้องสลับลำดับแถวตามบทบาทที่จะทดสอบ

| # | คนทำในแอป LINE | agent ตรวจในชีต |
|---|---|---|
| B1 | ลบแถวของตัวเองใน Users → บล็อกแล้วปลดบล็อก OA → ได้การ์ดต้อนรับ → กด **ลงทะเบียน** แล้วกรอกให้ครบ | Users มีแถวใหม่ `role=STAFF`, `active=TRUE` และมี `registered_at` |
| B2 | ตั้ง role ให้มี TECH กับ ADMIN แล้วกดเมนู **แจ้งซ่อม** → หมวด ELEC แนบรูป 2 รูป → ส่ง | Jobs มีแถวใหม่ `status=ASSIGNED`, `route_to=TECH`, `photos_before` มี 2 ID และ JobLog มีแถว `create` และในแชทต้องได้การ์ดเลขงาน (job_received) |
| B3 | TECH กด **รับงาน** บนการ์ด | `status=ACCEPTED`, มีค่า `accepted_at` และ `assignee_id` และ JobLog มีแถว `accept` |
| B4 | แจ้งงานหมวด KITCHEN | `route_to=ADMIN` และ `candidate_ids` เป็น ADMIN เท่านั้น |
| B5 | แจ้งงาน ELEC อีกงาน → TECH กด **ปฏิเสธ** ใส่เหตุผล → ADMIN เปิด `admin.html?id=<เลขงาน>` แล้วจ่ายงานให้ TECH | ได้ `REJECTED` ก่อน (reason ไม่ว่าง, `reject_count=1`) แล้วเป็น `ASSIGNED` ใหม่ และ JobLog มีแถว `reject` กับ `reassign` |
| B6 | TECH กด **ส่งต่อช่างนอก** ใส่เหตุผล → ADMIN จ่ายงานแบบ **ใช้ช่างนอก** เลือก Daikin | ได้ `route_to=ADMIN` และ `vendor=Daikin` และ JobLog มีแถว `forward` กับ `reassign` |
| B7 | ผู้รับงานกด **ถึงหน้างานแล้ว** → **ปิดงาน** ใส่อะไหล่ 2 รายการ (เช่น 2 × 50 และ 1 × 120) และรูป After 1 รูป | `checkin_at` มีค่า, `status=DONE`, `cost_total=220`, แท็บ Parts มี 2 แถวที่ `amount` ถูกต้อง และ `photos_after` มีค่า และผู้แจ้งต้องได้การ์ด job_done |
| B8 | ตอนปิดงาน ติ๊ก **ไม่มีคนอยู่หน้างาน** แต่ไม่กรอกหมายเหตุ | ระบบต้องไม่ยอมให้ส่ง และสถานะงานต้องไม่เปลี่ยน |
| B9 | ผู้แจ้งกด **รับทราบงาน** บนการ์ด job_done | `status=CLOSED`, มีค่า `closed_at`, `ack_by` และ `ack_at` |
| B10 | ไม่ต้องทำอะไร | งานที่ทดสอบทุกงานต้องมีแถว JobLog ครบทุกการเปลี่ยนสถานะ และ `from_status`/`to_status` ตรงกับ PLAN §3 |
| B11 | กด **รับงาน** ซ้ำบนการ์ดของงานที่มีคนรับแล้ว | ต้องได้ข้อความ "มีคนรับงานนี้แล้ว" และ JobLog ต้องไม่มีแถว accept เพิ่ม |

## รูปแบบรายงาน

- **ผลแต่ละข้อ:** ตารางที่มีคอลัมน์ ข้อ (A1–A5, B1–B11), ผ่าน/ไม่ผ่าน และหลักฐาน หลักฐานคือ output ของคำสั่ง ค่าในชีต หรือ screenshot
- **bug ที่เจอ:** อาการ, วิธีทำให้เกิดซ้ำ, `ไฟล์:บรรทัด` และวิธีแก้ที่เสนอ (ไม่ต้องแก้เอง)
- **ข้อที่ PLAN.md กับโค้ดไม่ตรงกัน:** ระบุเลขหัวข้อใน PLAN
