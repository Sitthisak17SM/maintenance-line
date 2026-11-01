# PLAN: สเปกเทคนิคระบบแจ้งซ่อมผ่าน LINE OA

เอกสารนี้เป็นแหล่งความจริงหลักของระบบ ถ้าโค้ดต้องต่างจากเอกสาร ให้แก้เอกสารนี้ใน commit เดียวกัน
อัปเดตล่าสุด: 30 ต.ค. 2026

## 1. สถาปัตยกรรม

```
ผู้ใช้ใน LINE ──แชท/กดปุ่ม──▶ LINE OA (Messaging API) ──webhook ?key=──▶ Apps Script Web App (/exec)
      │                                                                   │   ├─ Google Sheet (ฐานข้อมูล)
      └──เปิดหน้า──▶ LIFF บน GitHub Pages ──POST API + ID token───────────┘   └─ Google Drive (รูป)
Dashboard (GitHub Pages) ──POST action=dashboard──▶ Apps Script
Time trigger ทุก 15 นาที ──▶ Sla_tick()
```

- Web App URL (`/exec`) มีอันเดียว ใช้รับทั้ง webhook ของ LINE และคำขอจากหน้า LIFF
- GitHub Pages วางได้แค่ไฟล์นิ่ง จึงรับ webhook เองไม่ได้ งานฝั่ง server ทั้งหมดจึงอยู่ใน Apps Script

## 2. บทบาทผู้ใช้

| role | ใคร | ทำอะไรได้ |
|---|---|---|
| STAFF | พนักงานร้าน | แจ้งซ่อม, ดูงานที่ตัวเองแจ้ง, กดรับทราบงานที่ตัวเองแจ้ง |
| MANAGER | ผู้จัดการร้าน | สิทธิ์แบบ STAFF, ดูงานทั้งสาขา, กดรับทราบแทนได้ในสาขาตัวเอง |
| TECH | ช่างอาคาร | รับงาน, ปฏิเสธ, ส่งต่อช่างนอก, check-in, ขอเลื่อน, ปิดงาน (เฉพาะงานที่ส่งถึงตัวเอง) และแจ้งซ่อมได้ |
| ADMIN | พี่แตงกวา | ทำได้ทุกอย่าง รวมถึงจ่ายงานใหม่, แก้ความเร่งด่วน, อนุมัติขอเลื่อน, ยกเลิก, ปิดงานแทนช่างนอก, ดู Dashboard |
| VIEWER | ผู้บริหาร | ดู Dashboard และรายการงานทั้งหมดแบบอ่านอย่างเดียว |

- **ผู้ลงทะเบียนใหม่:** ได้ role `STAFF` ก่อน แล้ว Admin แก้ role ในแท็บ Users เอง (เฟส 1 ยังไม่มีหน้าจอสำหรับแก้ role)
- **VIEWER แจ้งซ่อมไม่ได้:** อ่านอย่างเดียวตามตารางนี้ (AOF ยืนยัน 30 ต.ค. 2026)
- **`Users.active = FALSE`:** ใช้ API ไม่ได้ (ได้ `FORBIDDEN`) routing ข้าม และไม่ได้รับ push
    - ตั้งเป็น FALSE เมื่อ unfollow หรือ Admin แก้เอง
    - กลับเป็น TRUE อัตโนมัติเมื่อ follow OA อีกครั้ง (AOF ยืนยัน 30 ต.ค. 2026)
- **งานช่างนอก:** ADMIN เป็นผู้รับงานแทน (`assignee_id` เป็นของ ADMIN) และบันทึกชื่อผู้รับเหมาในคอลัมน์ `vendor`

## 3. สถานะงาน

**ค่าสถานะ:** `NEW`, `ASSIGNED`, `ACCEPTED`, `IN_PROGRESS`, `DONE`, `CLOSED`, `REJECTED`, `CANCELLED`

**กลุ่มของสถานะ**

- **งานเปิด:** NEW, ASSIGNED, REJECTED, ACCEPTED, IN_PROGRESS
- **รอรับทราบ:** DONE
- **ปิดแล้ว:** CLOSED, CANCELLED

การขอเลื่อนไม่ใช่สถานะ ใช้ flag `ext_pending = TRUE` และสถานะงานไม่เปลี่ยน

**เงื่อนไขเพิ่มของเฟส 2 (`when` ใน `STATUS_RULES`):** `request_ext` ทำได้เมื่อยังไม่มีคำขอค้าง ส่วน `decide_ext` ทำได้เมื่อมีคำขอค้าง ถ้าไม่ตรงตอบ `INVALID_STATE` และปุ่มจะไม่แสดง ขอเลื่อนได้เมื่อสถานะ ACCEPTED/IN_PROGRESS และวันใหม่ต้องอยู่หลังกำหนดเดิม คำขอเลื่อนผูกกับช่างที่ขอและงานที่ยังเปิดอยู่ จึงถูกล้าง (`ext_pending = FALSE`) อัตโนมัติเมื่อ `reject`, `forward`, `reassign`, `close` หรือ `cancel` (ตัดสินใจ 2 พ.ย. 2026 จากการรีวิว ทาง B) ช่างคนใหม่จึงไม่ได้กำหนดที่คนเก่าขอไว้ `auto_ack` ทำได้เฉพาะผู้กระทำระบบ (`STATUS_SYSTEM_ACTOR`, role `SYSTEM`) ซึ่งไม่มีใน Users

ทุก action ต้องผ่าน `Status_transition(job, action, actor, input)` ใน `gas/core/Status.js` ฟังก์ชันนี้ต้องตรวจสถานะต้นทางและสิทธิ์ แล้วคืนค่าฟิลด์ที่ต้องเปลี่ยน ทุก action เขียน JobLog 1 แถว

- **ลำดับการตรวจ:** ตรวจสิทธิ์ก่อน (`FORBIDDEN`) แล้วจึงตรวจสถานะ (`INVALID_STATE` ยกเว้น accept ที่ได้ `CONFLICT`) use-case ที่ต้องตรวจข้อมูลก่อนเข้า state machine (รูปของ closeJob, ผู้ใช้/ช่างนอกของ reassignJob, ความเร่งด่วนของ setPriority) เรียก `Status_assertCan` ก่อนเสมอ
- **ตารางสิทธิ์อยู่ที่เดียว:** `STATUS_RULES` ใน `core/Status.js` รวมถึง `Status_canView`, `Status_allowedActions` (ปุ่มในหน้า job) และ scope ของ listJobs
- **"candidate หรือ assignee" ของ reject/forward:** ตอน ASSIGNED คือ candidate ทุกคน พอ ACCEPTED แล้วเหลือแค่ assignee

| action | จากสถานะ | ไปสถานะ | ใครทำได้ | สิ่งที่ระบบทำ | เฟส |
|---|---|---|---|---|---|
| create | — | ASSIGNED (หรือ NEW ถ้าหาผู้รับไม่ได้) | ผู้ที่ลงทะเบียนแล้ว ยกเว้น VIEWER | สร้าง job_id, created_at, response_due_at, due_at, คำนวณ routing, assigned_at แล้ว push การ์ด job_new | 1 |
| accept | ASSIGNED | ACCEPTED | คนใน candidate_ids หรือ ADMIN | accepted_at, assignee_*; คนแรกที่กดได้งาน คนอื่นได้ CONFLICT | 1 |
| reject | ASSIGNED, ACCEPTED | REJECTED | candidate หรือ assignee | เหตุผล (บังคับ), reject_count + 1, ล้าง assignee, push job_rejected ให้ ADMIN | 1 |
| forward | ASSIGNED, ACCEPTED | ASSIGNED (NEW ถ้าไม่มี ADMIN ที่ active) | TECH ที่เป็น candidate หรือ assignee | เหตุผล (บังคับ), route_to = ADMIN, candidate_ids = ADMIN ทุกคน, ล้าง assignee, push job_new ให้ ADMIN พร้อมเหตุผล | 1 |
| reassign | NEW, REJECTED, ASSIGNED, ACCEPTED | ASSIGNED | ADMIN | candidate_ids = คนที่เลือก (TECH หรือ ADMIN ที่ active) หรือ ADMIN เอง + vendor (ชื่อจากแท็บ Vendors), ล้าง assignee, assigned_at ใหม่, push job_new (ไม่ส่งให้ ADMIN ที่กดจ่ายงานเอง) | 1 |
| checkin | ACCEPTED | IN_PROGRESS | assignee หรือ ADMIN | checkin_at | 1 |
| close | ACCEPTED, IN_PROGRESS | DONE | assignee หรือ ADMIN | done_at, cause และ fix (ไม่บังคับ), แถว Parts (amount = qty × unit_price), cost_total, photos_after (อย่างน้อย 1 รูป server ตรวจด้วย), onsite_note แล้ว push job_done ให้ผู้แจ้ง | 1 |
| ack | DONE | CLOSED | ผู้แจ้ง, MANAGER ของสาขานั้น, ADMIN | closed_at, ack_by, ack_at | 1 |
| request_ext | ACCEPTED, IN_PROGRESS | (ไม่เปลี่ยน) | assignee | ext_pending = TRUE, ext_requested_due_at, ext_reason แล้ว push ext_request ให้ ADMIN | 2 |
| decide_ext | ACCEPTED, IN_PROGRESS ที่ ext_pending = TRUE | (ไม่เปลี่ยน) | ADMIN | ext_pending = FALSE ถ้าอนุมัติ: due_at = ext_requested_due_at, ext_count + 1, ล้าง flag D75/DB แล้ว push ext_result | 2 |
| set_priority | ทุกสถานะที่ยังไม่ปิด | (ไม่เปลี่ยน) | ADMIN | คำนวณ response_due_at และ due_at ใหม่จาก created_at, ล้าง alert_flags, JobLog เก็บค่าเดิมกับค่าใหม่ | 2 |
| cancel | งานเปิด | CANCELLED | ADMIN | เหตุผล (บังคับ) | 2 |
| auto_ack | DONE | CLOSED | ระบบ (เมื่อ AUTO_ACK_HOURS > 0) | ack_by = `AUTO` | 2 |

## 4. โครงสร้าง Google Sheet

ใช้ชีตไฟล์เดียว แถวแรกของทุกแท็บเป็นหัวคอลัมน์ ต้องสะกดตามนี้ทุกตัว `Setup_init()` เป็นคนสร้างแท็บ ใส่หัวคอลัมน์ และใส่ข้อมูลตั้งต้น

**คอลัมน์ข้อความ:** คอลัมน์ชนิด text ที่เป็น ID เบอร์โทร หรือข้อความที่ผู้ใช้พิมพ์ ตั้งรูปแบบเป็น plain text (`@`) ตาม `SETUP_TEXT_COLUMNS` เพื่อให้ "1/2" ไม่กลายเป็นวันที่ การรัน `Setup_init` ซ้ำจะใส่รูปแบบให้ชีตเดิมด้วย รูปแบบ `@` กันสูตรไม่ได้ (ทดสอบ 30 ต.ค. 2026: `=1+1` ยังกลายเป็นสูตร) จึงให้ `Repo_*` เติม `'` หน้าข้อความที่ขึ้นต้นด้วย `= + - @` ทุกคอลัมน์ก่อนเขียน การหาแถวด้วยค่า ID ตัดช่องว่างหัวท้ายทั้งสองฝั่ง

### Jobs (1 แถว = 1 งาน)

| คอลัมน์ | ชนิด | หมายเหตุ |
|---|---|---|
| job_id | text | `MT-YYMM-NNNN` เลขรันนิ่งรีเซ็ตทุกเดือน ตัวนับเก็บใน Script Properties และสร้างภายใต้ lock |
| created_at | Date | |
| branch_code | text | อ้าง Branches |
| area | text | จาก Areas หรือพิมพ์เอง |
| category_code | text | อ้าง Categories |
| title | text | ยาวไม่เกิน 80 ตัวอักษร |
| detail | text | |
| priority_reported | enum | EMERGENCY / URGENT / NORMAL / PREVENTIVE |
| priority | enum | ค่าที่ใช้จริง Admin แก้ได้ |
| reporter_id | text | LINE userId |
| reporter_name | text | |
| reporter_phone | text | |
| photos_before | text | Drive file ID คั่นด้วย `,` |
| route_to | enum | TECH / ADMIN |
| candidate_ids | text | userId คั่นด้วย `,` |
| assignee_id | text | |
| assignee_name | text | |
| vendor | text | ชื่อช่างนอก (จาก Vendors) |
| status | enum | ดู §3 |
| assigned_at | Date | |
| accepted_at | Date | |
| checkin_at | Date | |
| done_at | Date | |
| closed_at | Date | |
| response_due_at | Date | ดู §11 |
| due_at | Date | ดู §11 |
| ext_pending | boolean | |
| ext_requested_due_at | Date | |
| ext_reason | text | |
| reject_count | number | |
| ext_count | number | |
| cause | text | สาเหตุของปัญหา |
| fix | text | วิธีแก้ไข |
| cost_total | number | บาท รวมจาก Parts |
| photos_after | text | Drive file ID คั่นด้วย `,` |
| onsite_note | text | หมายเหตุเมื่อไม่มีคนอยู่หน้างาน |
| ack_by | text | userId หรือ `AUTO` |
| ack_at | Date | |
| alert_flags | text | เช่น `R75,RB` (ดู §11) |
| is_repeat | boolean | เฟส 3 |
| related_job_id | text | เฟส 3 |
| source | enum | LINE / MIGRATED |
| updated_at | Date | |

### แท็บอื่น

| แท็บ | หัวคอลัมน์ |
|---|---|
| JobLog | log_id, job_id, at, actor_id, actor_name, action, from_status, to_status, reason, old_value, new_value |
| Parts | job_id, line_no, item, qty, unit_price, amount, vendor, note |
| Users | line_user_id, display_name, real_name, phone, role, branch_code, active, registered_at, note |
| Branches | branch_code, name, active, sort |
| Areas | branch_code, area_name, sort, active |
| Categories | category_code, name_th, route_to, assignee_user_id, sort, active |
| SLA | priority, label_th, response_hours, resolve_hours, sort |
| Vendors | vendor_id, type, name, contact, branch_code, note, active |
| Config | key, value, note |
| WebhookLog | at, event_type, user_id, webhook_event_id, payload (ใช้ตอน ENV=test เท่านั้น) |
| Budget (เฟส 3) | branch_code, month, budget_thb |
| PM_Plan (เฟส 3) | pm_id, branch_code, asset, category_code, every_months, next_due, assignee_user_id, note |

### ข้อมูลตั้งต้น

**Branches**

| branch_code | name |
|---|---|
| PPP | PPP |
| TICHUCA | Tichuca |
| SANCTUARY | Sanctuary |
| TAHONA | Tahona |
| GIR | GIR |
| SCOFFLAWS | Scofflaws |
| LLOYDS | Lloyd's |

**Categories** (หมวดที่ยังไม่คอนเฟิร์มให้ส่งไปหา ADMIN ก่อน งานจะได้ไม่ตกหล่น)

| category_code | name_th | route_to |
|---|---|---|
| ELEC | ระบบไฟฟ้า / หลอดไฟ | TECH |
| WATER | ระบบน้ำ / ประปา / สุขภัณฑ์ | TECH |
| AC | เครื่องปรับอากาศ | ADMIN (รอคอนเฟิร์ม) |
| KITCHEN | เครื่องมือประกอบอาหาร / เครื่องจักร / เครื่องใช้ไฟฟ้า | ADMIN |
| STRUCT | โครงสร้างร้าน / ป้าย / งานเฟอร์นิเจอร์ | TECH |
| IT | ระบบ IT / POS / กล้องวงจรปิด | ADMIN (รอคอนเฟิร์ม) |
| MISC | จิปาถะ อื่นๆ | ADMIN |

**SLA** (`response_hours` มาจากแท็บ KPI เดิม ส่วน `resolve_hours` เป็นค่าเสนอที่ยังต้องคอนเฟิร์ม)

| priority | label_th | response_hours | resolve_hours |
|---|---|---|---|
| EMERGENCY | Emergency (ภายใน 2–4 ชม.) | 4 | 24 |
| URGENT | Urgent (ภายใน 24 ชม.) | 24 | 72 |
| NORMAL | Normal (ภายใน 2–3 วัน) | 72 | 168 |
| PREVENTIVE | Preventive (ภายใน 7–30 วัน) | 720 | 720 |

**Areas** (ใส่ branch_code เป็น `*` = ใช้ได้ทุกร้าน): บาร์, ครัว, ห้องน้ำชาย, ห้องน้ำหญิง, ทางเข้า / หน้าร้าน, โซนลูกค้า, Outdoor, ห้องเก็บของ / สโตร์, ห้องเครื่องเสียง / ดีเจ, อื่นๆ

**Vendors:** ย้ายมาจากแท็บ `supplier` ในไฟล์เดิม แล้วเพิ่มผู้รับเหมาที่เคยใช้ในประวัติงาน เช่น Daikin, 66 Kitchen, VJ Group (เฟส 0 ใส่ไว้แค่ V001 Daikin, V002 66 Kitchen, V003 VJ Group ช่อง type ว่าง ส่วนแท็บ `supplier` ยังไม่ได้ย้าย)

**Config**

| key | value | note |
|---|---|---|
| ENV | test | test หรือ prod |
| JOB_ID_PREFIX | MT | |
| AUTO_ACK_HOURS | 0 | 0 = ไม่ปิดงานอัตโนมัติ |
| NOTIFY_REPORTER_ON_ACCEPT | FALSE | push แจ้งผู้แจ้งตอนช่างรับงาน |
| REMIND_AT_PERCENT | 75 | เตือนเมื่อใช้เวลาไปถึงกี่ % |
| PHOTO_MAX_COUNT | 4 | ต่อการส่ง 1 ครั้ง |
| PHOTO_MAX_EDGE_PX | 1280 | ย่อด้านยาวก่อนอัปโหลด |
| VIDEO_MAX_MB | 0 | 0 = ยังไม่รับวิดีโอ (เปิดในเฟส 2 หลังทดสอบ) |
| FLEX_SHOW_PHOTO | TRUE | แสดงรูปแรกบนการ์ด job_new ถ้าไม่มีแถวนี้ถือว่า TRUE (ตั้ง FALSE ถ้ารูปไม่แสดง ดู §18) |

## 5. Script Properties

| key | ค่า | ใครใส่ |
|---|---|---|
| LINE_CHANNEL_ACCESS_TOKEN | long-lived token ของ Messaging API channel | ผู้ใช้ |
| LINE_LOGIN_CHANNEL_ID | Channel ID ของ LINE Login channel (ใช้ตรวจ ID token) | ผู้ใช้ |
| LIFF_ID | LIFF ID | ผู้ใช้ |
| WEBHOOK_KEY | สตริงสุ่มอย่างน้อย 32 ตัว | ผู้ใช้ |
| WEB_BASE_URL | `https://<github-user>.github.io/<repo>/` | ผู้ใช้ |
| SHEET_ID | ID ของชีต | Setup_init |
| DRIVE_FOLDER_ID | โฟลเดอร์เก็บรูป | Setup_init |
| JOB_SEQ_YYMM | ตัวนับเลขงานรายเดือน | ระบบ |

## 6. API (`doPost`)

**รูปแบบคำขอ**

- ส่ง `POST {API_URL}`
- body เป็น JSON string: `{"action": "...", "idToken": "...", "data": {...}}`
- header `Content-Type: text/plain;charset=utf-8` เพื่อเลี่ยง CORS preflight
- Apps Script จะตอบด้วย 302 ไปยัง googleusercontent ซึ่ง `fetch` ตามให้เอง

**รูปแบบคำตอบ**

- สำเร็จ: `{"ok": true, "data": ...}`
- ไม่สำเร็จ: `{"ok": false, "error": {"code": "...", "message": "..."}}`
- รหัส error: `AUTH`, `NOT_REGISTERED`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `VALIDATION`, `CONFLICT`, `INTERNAL`

**การแยกคำขอใน `doPost(e)`**

- มี `e.parameter.key` แปลว่าเป็น LINE webhook (§7)
- ไม่มี แปลว่าเป็น API

**การยืนยันตัวตน**

1. POST ไปที่ `https://api.line.me/oauth2/v2.1/verify` ด้วย `id_token` และ `client_id = LINE_LOGIN_CHANNEL_ID`
2. ค่า `sub` ที่ได้กลับมาคือ userId
3. cache ผลไว้ 10 นาทีใน CacheService โดยใช้ SHA-256 ของ token เป็น key
4. ถ้า token หมดอายุ ให้ตอบ `AUTH` แล้วให้หน้าเว็บ reload เพื่อขอ token ใหม่

| action | data | สิทธิ์ | เฟส |
|---|---|---|---|
| ping | — | ไม่ต้องมี token | 0 |
| whoami | — | มี idToken | 0 |
| me | — | มี idToken | 1 |
| register | real_name, phone, branch_code | มี idToken | 1 |
| createJob | branch_code, area, category_code, title, detail, priority, phone, photos[] | ลงทะเบียนแล้ว | 1 |
| getJob | job_id | ผู้แจ้ง, candidate/assignee, MANAGER ของสาขา, ADMIN, VIEWER | 1 |
| listJobs | scope (mine / branch / assigned / all), statuses[] | ตาม scope | 1 |
| acceptJob | job_id | candidate, ADMIN | 1 |
| rejectJob | job_id, reason | candidate/assignee | 1 |
| forwardJob | job_id, reason | TECH ที่เป็น candidate/assignee | 1 |
| reassignJob | job_id, assignee_id หรือ vendor | ADMIN | 1 |
| checkin | job_id | assignee, ADMIN | 1 |
| closeJob | job_id, cause, fix, parts[{item, qty, unit_price, vendor}], photos[], onsite_note | assignee, ADMIN | 1 |
| ackJob | job_id | ผู้แจ้ง, MANAGER ของสาขา, ADMIN | 1 |
| requestExtension | job_id, reason, new_due_at | assignee | 2 |
| decideExtension | job_id, approve, note | ADMIN | 2 |
| setPriority | job_id, priority, reason | ADMIN | 2 |
| cancelJob | job_id, reason | ADMIN | 2 |
| dashboard | from, to, branch_code? | ADMIN, VIEWER | 2 |

**ค่าที่ action `me` คืน:** `{user|null, branches, areas, categories, sla, config}` โดย config คืนเฉพาะค่าที่หน้าเว็บต้องใช้ (`PHOTO_MAX_COUNT`, `PHOTO_MAX_EDGE_PX`, `VIDEO_MAX_MB`) และ `user.active` บอกว่าบัญชีถูกปิดหรือไม่

**ค่าที่ action อื่นคืน**

- `me` กับ `register` ใช้แค่ ID token ส่วน action อื่นต้องเป็นผู้ใช้ที่ลงทะเบียนแล้วและ active
- `register`: `{user}` ผู้ใช้ใหม่ได้ role STAFF และต้องเลือกร้าน ผู้ใช้เดิมแก้ได้แค่ชื่อจริงกับเบอร์ (role ไม่เปลี่ยน) เฉพาะ role STAFF ที่เปลี่ยนร้านเองได้ role อื่นใช้ร้านตามที่ Admin ตั้งในแท็บ Users และระบบไม่สนใจ `branch_code` ที่ส่งมา เพราะร้านเป็นขอบเขตสิทธิ์ของ MANAGER (§2)
- `createJob`: `phone` ถ้ากรอกต้องตรงรูปแบบเดียวกับ `register` ถ้าเว้นว่างใช้เบอร์ที่ลงทะเบียนไว้
- `getJob`: `{job, status_label, photos_before_urls, photos_after_urls, parts, log, allowed_actions}` ถ้าเป็น ADMIN มี `reassign_options: {users, vendors}` (TECH/ADMIN ที่ active และ Vendors ที่ active) สำหรับหน้า admin
- `listJobs`: `{total, jobs}` เรียงงานใหม่ก่อน ไม่เกิน 200 งาน กรองด้วย `branch_code` ได้ (MANAGER ใช้ scope branch ได้เฉพาะสาขาตัวเอง)
- action ที่เปลี่ยนสถานะ: `{job_id, status, job}`
- ถ้ารอ lock เกิน 10 วินาทีจะได้ `CONFLICT` ให้ลองใหม่

**รูปแบบรูปใน `photos`:** `[{"mime": "image/jpeg", "b64": "..."}]` ไม่เกิน `PHOTO_MAX_COUNT` รูป server รับเฉพาะ `image/jpeg` (ตรวจทั้ง mime และ byte แรกของไฟล์ต้องเป็น `FF D8 FF`) และปฏิเสธรูปที่ใหญ่เกิน 2 MB หลัง decode

## 7. LINE webhook

**การรับคำขอ**

- Webhook URL คือ `{API_URL}?key={WEBHOOK_KEY}`
- ถ้า key ไม่ตรงให้หยุดทันที
- Apps Script อ่าน header `X-Line-Signature` ไม่ได้ จึงใช้ key ใน URL แทนการตรวจลายเซ็น

**การกันซ้ำ:** ถ้าเจอ `webhookEventId` ซ้ำให้ข้าม (cache key `evt_<id>` อายุ 6 ชั่วโมง)

**ขอบเขต:** เฟส 1 รับเฉพาะ event ที่ `source.type = user` ส่วน group/room ให้ข้าม

**การจัดการแต่ละ event**

- **`follow`:** reply การ์ด welcome พร้อมปุ่มลงทะเบียน และตั้ง `Users.active = TRUE` ถ้าเคยลงทะเบียนแล้ว
- **`unfollow`:** ตั้ง `Users.active = FALSE`
- **ผู้ใช้ที่ยังไม่ลงทะเบียนหรือถูกปิด:** "งานของฉัน" และ postback ตอบการ์ดให้ลงทะเบียนหรือข้อความแจ้ง
- **error ที่ไม่คาดคิด:** ยัง reply ข้อความสั้นๆ ว่าระบบขัดข้อง และเก็บรายละเอียดใน `diag_webhook`
- **`message` แบบข้อความ:**
  - ตรงรูปแบบ `^MT-\d{4}-\d{4}$` และผู้ส่งเป็นผู้แจ้งของงานนั้น: reply การ์ด job_received ข้อความนี้มาจาก `liff.sendMessages` ในหน้า report จึงตอบด้วย reply ได้โดยไม่เสียโควตา (ถ้าไม่ใช่ผู้แจ้งตอบข้อความช่วยเหลือ)
  - "งานของฉัน": reply งานที่ยังเปิดไม่เกิน 5 งาน ที่ผู้ส่งเป็นผู้แจ้ง candidate หรือ assignee พร้อมปุ่มไปหน้า jobs
  - "ping": reply "pong" (ใช้เช็คระบบ)
  - ข้อความอื่น: reply ข้อความช่วยเหลือสั้นๆ
- **`postback`:**
  - data เป็น querystring เช่น `a=accept&j=MT-2611-0001`
  - ค่า `a` ที่รองรับ: `accept`, `ack`, `ext_ok`, `ext_no` (เฟส 1 ตอบว่ายังไม่เปิดใช้งาน)
  - เรียก use-case เดียวกับ API โดยถือ `source.userId` เป็นผู้กด แล้ว reply ผลกลับ

**การตอบกลับ:** ลองตอบด้วย `HtmlService.createHtmlOutput('OK')` ในเฟส 0 แล้วบันทึกผลไว้ใน §18

**ความเร็ว:** งานใน webhook ต้องเบา คือเขียนชีตครั้งเดียวและ reply ครั้งเดียว

- คำขอที่ไม่มี event (ปุ่ม Verify) ตอบทันทีโดยไม่เปิดชีต
- ค่า `ENV` จากแท็บ Config cache ไว้ 10 นาที (cache key `cfg_env`) แก้ ENV แล้วรอได้ถึง 10 นาที
- reply ก่อนเขียน WebhookLog และเขียน WebhookLog เสมอแม้ reply ล้มเหลว

**การวินิจฉัย:** log ของ Web App ที่ LINE เรียกไม่แสดงใน editor จึงเก็บขั้นตอนล่าสุด 20 บรรทัดไว้ใน cache (`diag_webhook`) แล้วรัน `Setup_check()` ใน editor เพื่อดู พร้อมเช็คว่า Script Properties ครบ (แสดงแค่ความยาว ไม่แสดงค่า) และ token ใช้ได้

## 8. การ์ดแจ้งเตือนและโควตา

| card | ส่งเมื่อ | ถึงใคร | ปุ่ม | ชนิด | เฟส |
|---|---|---|---|---|---|
| welcome | follow | ผู้ใช้ใหม่ | ลงทะเบียน | reply | 1 |
| job_new | create, forward, reassign | candidates | รับงาน (postback) · ปฏิเสธ (LIFF job?do=reject) · รายละเอียด | push | 1 |
| job_received | ได้เลขงานจาก liff.sendMessages | ผู้แจ้ง | ดูสถานะ | reply | 1 |
| accept_result | กดรับงาน | คนที่กด | เปิดงาน (หรือแจ้งว่ามีคนรับไปแล้ว) | reply | 1 |
| job_rejected | reject | ADMIN | จ่ายงานใหม่ (LIFF admin) | push | 1 |
| job_done | close | ผู้แจ้ง (ถ้า inactive ส่งให้ MANAGER ของสาขา) | รับทราบงาน (postback) · รายละเอียด | push | 1 |
| ack_result | ack | คนที่กด | — | reply | 1 |
| ext_request | request_ext | ADMIN | อนุมัติ · ไม่อนุมัติ (postback) | push | 2 |
| ext_result | decide_ext | assignee | เปิดงาน | push | 2 |
| sla_alert | Sla_tick | assignee เมื่อถึง 75% และ ADMIN เมื่อเกินกำหนด (รวมทุกงานเป็นข้อความเดียวต่อคนต่อรอบ) | เปิดงาน | push | 2 |

**เนื้อหาการ์ด job_new**

- รูปแรก (ถ้าแสดงได้ ดู §18)
- job_id และป้ายความเร่งด่วน
- ร้าน · Area
- หมวด
- หัวข้อ
- รายละเอียด (ตัดที่ 120 ตัวอักษร)
- ผู้แจ้ง (พร้อมเบอร์โทรตาม R1) และเวลา
- "ต้องเข้าหน้างานภายใน" ตามด้วยค่า response_due_at

**สีป้ายความเร่งด่วน:** EMERGENCY `#D32F2F` · URGENT `#F57C00` · NORMAL `#1976D2` · PREVENTIVE `#757575`

**การนับโควตา**

- LINE นับต่อผู้รับต่อคำขอ ส่งหลาย bubble ให้คนเดียวในคำขอเดียวนับเป็น 1
- reply ไม่นับโควตา
- คาดว่าใช้ push 2–3 ข้อความต่องาน
- ไม่ push ให้ผู้กดเอง: reassign ไม่ส่ง job_new ให้ ADMIN ที่จ่ายงาน และ reject ไม่ส่ง job_rejected ให้ ADMIN ที่ปฏิเสธเอง
- `NOTIFY_REPORTER_ON_ACCEPT` ยังไม่ใช้ในเฟส 1 (Q8)

## 9. หน้า LIFF (`web/`)

**การตั้งค่า LIFF**

- ใช้ LIFF app ตัวเดียว และตั้ง Endpoint URL เป็น `WEB_BASE_URL`
- เปิดหน้าอื่นด้วย `https://liff.line.me/{LIFF_ID}/<page>.html` LINE จะต่อ path นี้ท้าย endpoint ให้หลัง `liff.init()`
- `web/index.html` ต้องโหลด LIFF SDK และเรียก `liff.init()` เพราะเป็นปลายทางแรกของการ redirect
- ทุกหน้าต้องเรียก `liff.init({ liffId })` เองด้วย

**ลำดับที่ทุกหน้าใช้ร่วมกัน (`js/liff.js`)**

1. เรียก `init`
2. ถ้ายังไม่ได้ login ให้เรียก `liff.login({ redirectUri: location.href })`
3. ได้ token จาก `liff.getIDToken()`
4. เรียก `api('me')`
5. ถ้ายังไม่ลงทะเบียนให้พาไปหน้า register

ขั้นตอนนี้อยู่ใน `startPage()` หน้า register รับ `?next=<page>.html?...` เพื่อพากลับหน้าเดิม และรับเฉพาะชื่อหน้าของเราเท่านั้น (กัน redirect ออกนอกเว็บ) โค้ดของแต่ละหน้าอยู่ใน `<script>` ท้ายไฟล์ HTML นั้น ข้อความที่ผู้ใช้กรอกใส่ผ่าน `textContent` เสมอ (`el()` ใน `js/ui.js`) ห้ามใช้ `innerHTML` เมื่อกรอกฟอร์มไม่ครบ หน้าจะเลื่อนไปที่ช่องนั้นและขึ้นกรอบแดง (`invalid()`)

| ไฟล์ | ใช้โดย | ทำอะไร | เฟส |
|---|---|---|---|
| index.html | — | LIFF endpoint: เรียก liff.init แล้วพาไปหน้าตาม path | 0 |
| ping.html | นักพัฒนา | เรียก whoami แล้วแสดง userId | 0 |
| register.html | ทุกคน | ลงทะเบียนชื่อจริง เบอร์ ร้าน (role ที่ไม่ใช่ STAFF ช่องร้านล็อกไว้) | 1 |
| report.html | ผู้แจ้ง | ฟอร์มแจ้งซ่อมพร้อมรูป | 1 |
| job.html?id= | ผู้เกี่ยวข้อง | รายละเอียด รูป ประวัติจาก JobLog และปุ่มตามสิทธิ์กับสถานะ (`&do=reject` เปิดฟอร์มปฏิเสธทันที) | 1 |
| jobs.html | ทุกคน | รายการงานตาม scope กรองตามสถานะและร้านได้ | 1 |
| admin.html?id= | ADMIN | จ่ายงานใหม่หรือเลือกช่างนอก (เฟส 1) แก้ความเร่งด่วน อนุมัติขอเลื่อน ยกเลิก (เฟส 2) ถ้าไม่มี `id` แสดงรายการงานรอจ่าย (NEW, REJECTED, ASSIGNED) | 1–2 |
| dashboard.html | ADMIN, VIEWER | กราฟ KPI ด้วย Chart.js | 2 |

**ฟอร์มแจ้งซ่อม (`report.html`)**

- **ร้าน:** ค่าเริ่มต้นคือร้านของผู้ใช้
- **Area:** เลือกจาก Areas ของร้านนั้นหรือรายการกลาง (`*`) หรือเลือก "อื่นๆ" แล้วพิมพ์เอง
- **หมวด**
- **หัวข้อ:** บังคับกรอก
- **รายละเอียด**
- **ความเร่งด่วน:** radio พร้อมป้ายเวลาจาก SLA
- **เบอร์โทร:** เติมให้จากข้อมูลลงทะเบียน
- **รูป:** ไม่เกิน 4 รูป
  - ใช้ `accept="image/*"` และ `capture="environment"`
  - ย่อด้วย canvas เป็น JPEG คุณภาพ 0.7 ให้ด้านยาวไม่เกิน 1280 px
- **หลังส่งสำเร็จ:**
  - ถ้า `liff.isInClient()` และ `liff.getContext().type === 'utou'` ให้เรียก `liff.sendMessages([{type:'text', text: job_id}])` แล้ว `liff.closeWindow()`
  - กรณีอื่นให้แสดงเลขงานบนหน้า

**ฟอร์มปิดงาน (ใน `job.html`)**

- **สาเหตุ:** ไม่บังคับ (เปลี่ยน 30 ต.ค. 2026 ดู REQUIREMENTS R12)
- **วิธีแก้:** ไม่บังคับ
- **รายการอะไหล่:** เพิ่มหรือลบแถวได้ แต่ละแถวมี item, qty, unit_price, vendor
- **รูป After:** อย่างน้อย 1 รูป
- **ช่อง "ไม่มีคนอยู่หน้างาน":** ถ้าติ๊กต้องกรอก onsite_note

**Rich menu**

- เฟส 1: เมนูเดียวสำหรับทุกคน ตั้งใน LINE OA Manager มี 2 ปุ่ม คือ "แจ้งซ่อม" ไปหน้า report และ "งานของฉัน" ไปหน้า jobs
- เฟส 2: ถ้าต้องการ ทำเมนูแยกตามบทบาทผ่าน API

## 10. การส่งงาน (Routing) — `gas/core/Routing.js`

```
category = Categories[category_code]
if category.assignee_user_id           -> candidates = [that user]
else if category.route_to == 'TECH'    -> candidates = active Users where role == 'TECH'
else                                   -> candidates = active Users where role == 'ADMIN'
if candidates is empty                 -> candidates = active ADMINs
                                           (and status = NEW if there is no ADMIN either)
job.route_to = category.route_to; job.candidate_ids = candidates
```

- ถ้า `assignee_user_id` ไม่มีในแท็บ Users หรือ inactive ให้ใช้กฎตาม route_to แทน งานจะได้ไม่หาย
- `route_to` ไม่สนตัวพิมพ์ ค่าอื่นที่ไม่ใช่ TECH ถือเป็น ADMIN และ `active` ที่เป็นช่องว่างถือว่า FALSE
- ส่งการ์ดให้ candidate ทุกคน คนแรกที่กดรับได้งาน
- ตอนรับงานต้องตรวจซ้ำภายใต้ lock ว่าสถานะยังเป็น ASSIGNED อยู่
- `forward` คือช่างอาคารส่งงานต่อให้ ADMIN เพื่อหาช่างนอก ไม่นับเป็นการปฏิเสธ

## 11. SLA และการเตือน — `gas/core/Sla.js`

**การคำนวณกำหนดเวลา**

- `response_due_at = created_at + SLA[priority].response_hours`
- `due_at = created_at + SLA[priority].resolve_hours` (เลื่อนได้เมื่อการขอเลื่อนได้รับอนุมัติ)
- นับเป็นชั่วโมงปฏิทิน 24/7 ไม่ตัดเวลาปิดร้าน

**การวัดผล**

- **response:** เวลาจาก created_at ถึง checkin_at ถ้าช่างไม่ได้ check-in ให้ใช้ accepted_at แทน
- **lead time:** เวลาจาก created_at ถึง done_at แล้วเทียบกับ due_at

**`Sla_tick()` รันทุก 15 นาทีจาก time trigger (`Triggers_install()`)**

- **ระยะเข้าหน้างาน** (ยังไม่มีทั้ง checkin_at และ done_at)
  - **R75:** ถึง 75% ของช่วงเวลาแล้ว เตือน assignee หรือ candidates
  - **RB:** เกิน response_due_at แล้ว เตือน ADMIN
- **ระยะซ่อม** (สถานะ ACCEPTED หรือ IN_PROGRESS)
  - **D75:** ถึง 75% ของช่วง created_at ถึง due_at เตือน assignee
  - **DB:** เกิน due_at แล้ว เตือน ADMIN
- **ปิดอัตโนมัติ:** งานสถานะ DONE ที่ AUTO_ACK_HOURS > 0 และเลยเวลาแล้ว ให้ทำ auto_ack
- **Flag:** ต่อท้ายใน `alert_flags` เพื่อไม่ให้เตือนซ้ำ set_priority ล้างทุก flag ส่วนการขอเลื่อนที่อนุมัติล้าง D75 และ DB
- **การรวมข้อความ:** รวมทุกงานของผู้รับคนเดียวกันในรอบเดียวเป็น push เดียว (carousel ละไม่เกิน 12 งาน สูงสุด 5 ข้อความต่อ push เกินจากนั้นสรุปเป็น "และอีก N งาน")
- **บันทึก flag:** เขียน flag เมื่อ push ถึงผู้รับอย่างน้อย 1 คน หรือเมื่อไม่มีผู้รับเลย ถ้า LINE ล่มรอบถัดไปจะเตือนซ้ำ
- **งานที่ไม่มีวันที่:** (เช่นงานที่ย้ายมาจากไฟล์เดิม) ไม่เตือน
- **ติดตั้ง:** รัน `Triggers_install()` ใน editor 1 ครั้งต่อ environment ทดสอบเร็วได้ด้วย `Dev_slaDemo()` (ENV=test)

**ฟังก์ชันล้วนที่ต้องมีเทสต์**

- `Sla_computeDueDates(createdAt, priority, slaRows)` คืน `{response_due_at, due_at}`
- `Sla_pendingAlerts(job, now, remindPct)` คืน flag ที่ต้องส่งในรอบนี้ (ไม่รวม flag ที่เคยส่งแล้ว)

## 12. รูปและไฟล์ (Drive)

- **ที่เก็บ:** `DRIVE_FOLDER_ID/YYYY-MM/`
- **ชื่อไฟล์:** `{job_id}_{before|after}_{n}.jpg`
- **การแชร์:** ตั้งเป็น "ทุกคนที่มีลิงก์ดูได้" เพื่อให้หน้า LIFF และการ์ดแสดงรูปได้ รูปเป็นภาพจุดชำรุดในร้าน ความเสี่ยงจึงต่ำ
- **URL สำหรับแสดงในหน้า LIFF:** `https://drive.google.com/thumbnail?id={fileId}&sz=w1000`
- **รูปบนการ์ด Flex:** ใช้ `https://lh3.googleusercontent.com/d/{fileId}=w1000` (ไม่ redirect) ต้องทดสอบว่า LINE แสดงได้หรือไม่ (§18) ถ้าไม่ได้ให้ตั้ง Config `FLEX_SHOW_PHOTO = FALSE`
- **ลำดับการบันทึก:** ตรวจข้อมูลและสิทธิ์ให้ผ่านก่อน แล้วจึงบันทึกรูป เพื่อไม่ให้มีไฟล์ค้างใน Drive เมื่อคำขอถูกปฏิเสธ ถ้าบันทึกรูปแล้วแต่การเขียนแถว Jobs ล้มเหลว (ตรวจซ้ำภายใต้ lock ไม่ผ่าน, lock หมดเวลา, Drive ล้มกลางชุด) ให้ย้ายรูปที่บันทึกไปแล้วลงถังขยะ แต่ถ้าแถว Jobs เขียนสำเร็จแล้วให้เก็บรูปไว้
- **ขนาด:** server ตรวจจำนวนรูปและขนาดทุกครั้ง ส่วนวิดีโอยังปิดไว้ (VIDEO_MAX_MB = 0)

## 13. Dashboard และ KPI (เฟส 2)

`action=dashboard` คำนวณที่ server แล้วคืนเฉพาะตัวเลขสรุป ไม่ส่งข้อมูลดิบ

**ค่าที่คืน**

- `cards`: open_count, overdue_count, avg_response_hours, cost_this_month
- `by_branch_status`: `[{branch, status, count}]`
- `by_month_category`: `[{month, category, count}]`
- `by_tech`: `[{assignee, jobs, avg_response_hours, on_time_rate}]`
- `cost_by_branch_month`: `[{branch, month, cost, budget}]` (budget มีในเฟส 3)
- `overdue_list`: ไม่เกิน 20 งาน
- `repeat_candidates`: งานร้าน + Area + หมวดเดียวกันที่เกิดซ้ำภายใน 7 วันหลังงานก่อนหน้าปิด

**สูตร KPI (ตามแท็บ KPI เดิม)**

| KPI | สูตร |
|---|---|
| Maintenance | ปิดแล้ว / ทั้งหมดในช่วงเวลา |
| Lead Time | งานที่ done_at ≤ due_at / งานที่เสร็จแล้ว |
| Response Time | ค่าเฉลี่ยของ (checkin_at หรือ accepted_at) − created_at |
| SLA | จำนวนงานเปิดที่เลยกำหนด |
| Quality | is_repeat / งานที่ปิดแล้ว |
| Cost Control | (ค่าซ่อม − งบ) / งบ (เฟส 3) |

**หน้าเว็บ:** `dashboard.html` ใช้ Chart.js จาก CDN มีตัวกรองช่วงวันที่ ร้าน หมวด และช่าง

**รายละเอียดที่ทำจริง (เฟส 2B, `gas/core/Kpi.js` มีเทสต์)**

- **ช่วงวันที่:** กรองจาก `created_at` เป็นวันตามเวลาไทย (`from`/`to` แบบ `YYYY-MM-DD` และ `to` รวมทั้งวัน) ค่าเริ่มต้น 90 วันล่าสุด งานที่ไม่มีวันที่ (งานเก่า) นับเฉพาะเมื่อเลือก "ทั้งหมด"
- **ตัวเลข "ตอนนี้" ไม่ขึ้นกับช่วงวันที่:** `open_count` (งานเปิด), `overdue_count` (งานเปิดที่เลย `due_at`) และ `cost_this_month` (รวม `cost_total` ของงานที่ `done_at` อยู่ในเดือนปฏิทินนี้ตามเวลาไทย) ส่วนตัวกรองร้าน หมวด และช่างใช้กับทุกตัวเลข
- **ช่าง:** `assignee_name` ถ้าไม่มีใช้ `vendor` ถ้าไม่มีทั้งคู่เป็น "(ไม่ระบุ)" เพราะงานเก่ามีแค่ชื่อ
- **KPI:** Maintenance = CLOSED ÷ งานที่ไม่ถูกยกเลิก, Lead Time = เสร็จไม่เกิน `due_at` ÷ งานที่เสร็จแล้วและมี `due_at`, Quality = `is_repeat` ÷ CLOSED, Response = ค่าเฉลี่ยของ (checkin_at หรือ accepted_at) − created_at
- **ค่าซ่อมรายเดือน:** นับตามเดือนของ `done_at` (`budget` เป็น null จนถึงเฟส 3)
- **งานซ่อมซ้ำ:** ร้าน + Area + หมวดเดียวกัน แจ้งใหม่ภายใน 7 วันหลัง `closed_at` (ถ้าไม่มีใช้ `done_at`) ของงานก่อนหน้า งานที่ไม่มี Area ไม่นับ แสดงไม่เกิน 20 รายการ
- **สิทธิ์:** `Status_canViewDashboard` (ADMIN, VIEWER) หน้าเว็บแสดง "ไม่มีสิทธิ์เข้าถึง" สำหรับ role อื่น
- **หน้าตา:** โทนแบรนด์ Paper Plane Project (พื้นขาว ตัวหนังสือดำ เขียวป่า ส้มอิฐ) ฟอนต์ Anuphan จาก Google Fonts แบ่งเป็น "ตอนนี้" (ไม่ขึ้นกับช่วงวันที่) กับ "ในช่วงที่เลือก" (จำนวนงาน เวลาถึงหน้างาน และ KPI 3 ตัวเป็นแถบเปอร์เซ็นต์พร้อมคำอธิบาย)
- **กราฟ:** 4 กราฟ แต่ละกราฟตอบคำถามเดียวและเขียนตัวเลขไว้ท้ายแท่ง: งานแต่ละร้าน (แท่งซ้อนตามสถานะ 4 กลุ่ม เรียงจากมากไปน้อย สีคงที่ตามสถานะ ผ่านตัวตรวจ CVD ของ dataviz), งานที่แจ้งรายเดือน, หมวดที่แจ้งบ่อย และค่าซ่อมรายเดือน (แตะแท่งเพื่อดูแยกตามร้าน) ทุกกราฟมี "ดูเป็นตาราง" เพราะสีเหลืองมี contrast ต่ำกว่า 3:1 บนมือถือตารางงานเลยกำหนดและงานซ่อมซ้ำแสดงเป็นรายการทีละงาน

**ทางเลือก:** ใช้ Looker Studio ต่อกับชีตตรงๆ ได้โดยไม่ต้องเขียนโค้ด

## 14. ย้ายข้อมูลเก่า (เฟส 2) — `Setup_migrateLegacy(sourceSheetId)`

**ต้นทาง:** ชีตเดิม Maintenance List

- แท็บ: `PPP`, `Tichuca`, `Santuary`, `Tahona`, `Gir`, `Scofflaws`, `Lloyds`
- หัวคอลัมน์อยู่แถวที่ 2: Date, Details, Technician, Type, Priority, Process, Note, Before pic, After pic

**การแมปข้อมูล**

| ปลายทาง | มาจาก |
|---|---|
| branch_code | ชื่อแท็บ (Santuary → SANCTUARY, Gir → GIR, Lloyds → LLOYDS) |
| created_at | Date ถ้าว่างให้ปล่อยว่าง มี 14 แถว และให้ Dashboard ตัดแถวพวกนี้ออกจาก KPI ที่อิงเวลา |
| title | บรรทัดแรกของ Details ไม่เกิน 80 ตัวอักษร |
| detail | Details ทั้งหมด ต่อท้ายด้วย "หมายเหตุเดิม: " และ Note |
| assignee_name / vendor | Technician ถ้าเป็น Daikin, 66 Kitchen หรือ VJ Group ให้ใส่ใน vendor |
| category_code | ระบบไฟ → ELEC · ระบบท่อ, ระบบน้ำ → WATER · แอร์, ระบบแอร์ → AC · เฟอร์นิเจอร์, งานไม้โครงสร้าง, โครงสร้าง, พื้น → STRUCT · อื่นๆ หรือว่าง → MISC |
| priority | Emergency / Urgent / Normal ถ้าว่างใช้ NORMAL |
| status | Done → CLOSED · On process → IN_PROGRESS · ว่าง → NEW |
| source | MIGRATED |

**ข้อกำหนด**

- ไม่ส่งแจ้งเตือน
- รันซ้ำได้โดยข้ามแถวที่เคยย้ายแล้ว (ร้าน + หัวข้อ + วันที่ตรงกัน)
- รูปที่ฝังในเซลล์ไม่ต้องย้าย
- จำนวนที่ควรได้ทั้งหมด 171 แถว (ตรวจกับไฟล์จริงแล้ว 1 พ.ย. 2026: 171 แถว key ไม่ซ้ำ 171)

**สิ่งที่ทำจริง (1 พ.ย. 2026)**

- **แหล่งข้อมูล:** ไฟล์ .xlsx เดิมมีรูปฝัง (7 MB) จึงทำสำเนาแบบค่าอย่างเดียวของ 7 แท็บเป็น Google Sheet "Maintenance List (สำเนาสำหรับย้ายข้อมูล ห้ามแก้)" (`SETUP_LEGACY_SHEET_ID` ใน `Setup.js`) ไฟล์ต้นฉบับไม่ถูกแตะ และห้าม commit ไฟล์ .xlsx (repo เป็น public)
- **การแมป:** อยู่ใน `gas/core/Migrate.js` (มีเทสต์) วันที่ในไฟล์เป็นเลข serial ของ Excel แปลงเป็นเที่ยงคืนเวลาไทย ช่างนอกในคอลัมน์ Technician จับจากข้อความ เช่น "ช่างเซอร์วิส\n66 kitchen" → vendor `66 Kitchen`
- **job_id:** `LG-{BRANCH}-{NNN}` เรียงตามลำดับในไฟล์ แยกจากเลข `MT-` เพื่อไม่ให้กินตัวนับรายเดือน
- **กำหนดเวลา:** ไม่ใส่ `response_due_at`/`due_at` งานเก่าจึงไม่ถูกเตือน SLA และไม่นับใน KPI ที่อิงกำหนดเวลา
- **วิธีรัน:** `Setup_migrateLegacyDryRun()` ดูผลก่อน แล้ว `Setup_migrateLegacyRun()` รันซ้ำได้ แถวที่มีอยู่แล้วจะถูกข้าม

## 15. โครงสร้าง repo

```
maintenance-line/
├── CLAUDE.md
├── README.md
├── .clasp.json          {"scriptId": "...", "rootDir": "gas"} (รัน clasp ที่ root)
├── docs/                PLAN.md, REQUIREMENTS.md, SETUP.md, PROMPTS.md, TEST_PHASE1.md
├── assets/              richmenu.png (2500×843, เทมเพลต 2 ช่องขนาดเล็ก)
├── gas/                 โค้ดที่ clasp push ขึ้น Apps Script
│   ├── appsscript.json  V8, Asia/Bangkok, webapp: executeAs USER_DEPLOYING, access ANYONE_ANONYMOUS
│   ├── Main.js          doGet/doPost dispatch
│   ├── Api.js           API actions + permission checks
│   ├── Webhook.js       LINE events
│   ├── Line.js          push, reply, verify ID token
│   ├── Flex.js          card builders
│   ├── Jobs.js          use-cases (create/accept/reject/...)
│   ├── Repo.js          sheet access by header name + LockService
│   ├── Drive.js         base64 → file, sharing
│   ├── Triggers.js      Sla_tick, Triggers_install
│   ├── Setup.js         Setup_init, Setup_check, Setup_migrateLegacy
│   ├── Dev.js           Dev_smokeTest, Dev_testFlexImage (ทำงานเฉพาะ ENV=test)
│   └── core/            pure logic, Node-testable
│       ├── Status.js  Sla.js  Routing.js  JobId.js  Migrate.js  Kpi.js
├── web/
│   ├── index.html  ping.html  register.html  report.html  job.html  jobs.html  admin.html  dashboard.html
│   ├── js/              config.js (LIFF_ID, API_URL), liff.js, api.js, image.js, ui.js
│   └── css/app.css
├── tests/               status.test.js, status-phase2.test.js, sla.test.js, routing.test.js, jobid.test.js, migrate.test.js
└── .github/workflows/   deploy-web.yml, deploy-gas.yml
```

## 16. CI/CD และ environment

**environment**

- เฟส 0–1 มีแค่ environment เดียวคือ test ประกอบด้วย OA ทดสอบ ชีตทดสอบ และ Apps Script ทดสอบ
- ก่อน pilot ให้เพิ่ม prod เป็นชุดแยก ได้แก่ Apps Script ตัวใหม่ ชีตจริง และ OA จริง

**`deploy-gas.yml`**

- เริ่มด้วย `node --test` ถ้าไม่ผ่านให้หยุด
- ใช้ Node 22 แล้วรัน `npm install -g @google/clasp`
- เขียน `~/.clasprc.json` จาก secret `CLASPRC_JSON`
- รัน `clasp push -f` ตามด้วย `clasp update-deployment $DEPLOYMENT_ID`
- push ขึ้น main แล้ว deploy ไป test เท่านั้น
- deploy ไป prod ต้องกดรันเอง (`workflow_dispatch` กับ input `target=prod`)
    - workflow เขียนทับ `scriptId` ใน `.clasp.json` ด้วย secret `SCRIPT_ID_PROD`
    - ใช้ `DEPLOYMENT_ID_PROD` แทน `DEPLOYMENT_ID`

**`deploy-web.yml`**

- deploy `web/` ขึ้น GitHub Pages
- พอมี prod แล้ว ให้ build เป็น `_site/` (config ของ prod) กับ `_site/test/` (config ของ test) workflow ทำแบบนี้เสมอ ถ้ายังไม่ได้ตั้ง `LIFF_ID_PROD` ทั้ง `/` และ `/test/` ใช้ config ทดสอบใน `web/js/config.js` ส่วน `LIFF_ID_TEST`/`API_URL_TEST` ถ้าตั้งไว้จะใช้แทนค่าในไฟล์สำหรับ `/test/`
- ค่า config มาจาก repository variables: `LIFF_ID_PROD`, `API_URL_PROD`, `LIFF_ID_TEST`, `API_URL_TEST`

## 17. การทดสอบ

**Unit test:** ใช้ `node --test` กับโค้ดใน `gas/core/` ต้องครอบคลุม

- การเปลี่ยนสถานะที่ถูกต้องและที่ต้องถูกปฏิเสธ
- การคำนวณกำหนดเวลาเมื่อเปลี่ยน priority
- เกณฑ์การเตือน
- routing
- รูปแบบเลขงานและการรีเซ็ตเมื่อขึ้นเดือนใหม่

**ทดสอบทั้งระบบ:** ทำตามเกณฑ์ผ่านใน `docs/PROMPTS.md`

**การทดสอบหลายบทบาท:** ใช้บัญชี LINE 2 บัญชี หรือสลับ role ในแท็บ Users

## 18. ความเสี่ยงที่ต้องพิสูจน์

| ความเสี่ยง | พิสูจน์ในเฟส | ผลทดสอบ | ทางสำรอง |
|---|---|---|---|
| Apps Script ตอบ webhook ด้วย 302 ไม่ใช่ 200 | 0 | 30 ต.ค. 2026: `HtmlService.createHtmlOutput` ตอบ 200 ตรง (ไม่ redirect) แต่ใช้เวลา ~1.1 วินาที Verify รอบแรก timeout เพราะเปิดชีตอ่าน Config หลังให้คำขอที่ไม่มี event ตอบทันทีและ cache ENV แล้ว Verify = Success | ถ้า event มาถึงและ doPost ทำงานถือว่าใช้ได้ แม้ปุ่ม Verify จะ error ให้ปิด webhook redelivery และกันซ้ำด้วย webhookEventId |
| รูปจาก Drive ไม่แสดงในการ์ด Flex | 1 | 30 ต.ค. 2026: แสดงได้ การ์ด job_new ของ MT-2610-0001 และ 0002 แสดงรูปจาก `lh3.googleusercontent.com/d/{fileId}=w1000` ใน LINE PC (ยังไม่ได้ดูบนมือถือ) จึงคง `FLEX_SHOW_PHOTO = TRUE` (ยังไม่ได้ทดสอบแบบ B = thumbnail เพราะแบบ A ใช้ได้แล้ว) วิธีทดสอบซ้ำ: `Dev_testFlexImage` | ตั้ง Config `FLEX_SHOW_PHOTO = FALSE` เพื่อตัดรูปออกจากการ์ด แล้วให้ดูรูปในหน้า LIFF แทน |
| ผู้ใช้ไม่ได้เพิ่มเพื่อน OA ทำให้ push ไม่ถึง | 1 | | ตั้ง LIFF Add friend option เป็น On (aggressive) |
| อัปโหลดรูปช้าหรือเกินเวลา | 1 | | ย่อรูปที่มือถือก่อน และจำกัดจำนวนกับขนาด |
| ข้อความเกินโควตาฟรี 300 ต่อเดือน | 2 | | ใช้ reply แทน push, รวมการเตือนเป็นข้อความเดียว หรืออัปเกรดเป็น Basic |
| มีคนกดรับงานพร้อมกัน | 1 | (กรอกหลังทดสอบ) ทำแล้ว: `Jobs_transition_` อ่านงานใหม่ภายใต้ script lock แล้วจึงเรียก `Status_transition` คนถัดไปได้ CONFLICT | ใช้ LockService และตรวจสถานะซ้ำก่อนเขียน |
