# SYSTEM: แผนที่ระบบแจ้งซ่อม LINE

เอกสารนี้บอกว่าระบบมีส่วนไหนบ้าง แต่ละไฟล์ทำอะไร และถ้าจะแก้เรื่องหนึ่งต้องไปแก้ที่ไหน รายละเอียดเชิงเทคนิค เช่น schema, API และกติกา อยู่ใน [PLAN.md](PLAN.md) ซึ่งเป็นแหล่งความจริงหลัก

อัปเดตล่าสุด 6 พ.ย. 2026

## 1. ภาพรวม

```
 พนักงาน / ผู้จัดการ / ช่าง / พี่แตงกวา
        │  (แอป LINE)
        ▼
 ┌──────────────┐  เปิดหน้าเว็บ   ┌─────────────────────────┐
 │ LINE OA      │───────────────▶│ หน้า LIFF (web/)         │
 │ @905mjiho    │                │ GitHub Pages             │
 └──────┬───────┘                └───────────┬─────────────┘
        │ webhook                            │ API (POST + ID token)
        │ (ปุ่มในการ์ด, ข้อความ)              │
        ▼                                    ▼
 ┌────────────────────────────────────────────────────────┐
 │ Google Apps Script Web App (gas/)  URL /exec เดียว      │
 │  Main → Webhook / Api → Jobs (use-case)                │
 │        → core/ (กติกา: สถานะ, สิทธิ์, ส่งงาน, SLA, KPI)  │
 │        → Repo (อ่าน/เขียนชีต)  Drive (รูป)  Line (push)  │
 │  Sla_tick ทุก 15 นาที (เตือนเกินกำหนด)                   │
 └──────────────┬──────────────────────────┬──────────────┘
                ▼                          ▼
        Google Sheet (ข้อมูลทั้งหมด)   Google Drive (รูป)
```

**ลำดับงาน**

1. แจ้งซ่อมพร้อมรูป
2. ระบบส่งการ์ดให้ช่างหรือ ADMIN ตามหมวด
3. ช่างกดรับหรือปฏิเสธ (หรือส่งต่อให้ ADMIN หาช่างนอก)
4. ช่าง Check-in
5. ช่างปิดงานพร้อมรูปหลังซ่อมและค่าใช้จ่าย
6. ผู้จัดการร้านกด "รับทราบงาน"

สถานะทั้งหมดอยู่ใน PLAN §3

**บทบาท:** STAFF (พนักงาน), MANAGER (ผู้จัดการร้าน, ต้องใส่ร้าน), TECH (ช่าง), ADMIN (พี่แตงกวา), VIEWER (ดู Dashboard อย่างเดียว) ดูสิทธิ์ใน PLAN §2

## 2. ระบบจริง (prod) กับระบบทดสอบ (test)

| | prod | test |
|---|---|---|
| LINE OA | @905mjiho | @475lnsdz |
| LIFF ID | `2012292087-nAgbJe2d` | `2012292087-0VGorWPr` |
| หน้าเว็บ | https://sitthisak17sm.github.io/maintenance-line/ | https://sitthisak17sm.github.io/maintenance-line/test/ |
| ลิงก์ที่ผู้ใช้เปิด | `https://liff.line.me/2012292087-nAgbJe2d/<หน้า>.html` | `https://liff.line.me/2012292087-0VGorWPr/<หน้า>.html` |
| Apps Script | โปรเจกต์ prod (deploy ด้วยมือ) | โปรเจกต์ test (deploy ทุกครั้งที่ push) |
| ชีต | ชีตจริง (`Config.ENV = prod`) | `Maintenance LINE (test)` |

- `web/js/config.js` ใน repo เก็บค่าของ **test** ส่วนค่าของ prod ตอน deploy มาจาก GitHub variables `LIFF_ID_PROD` และ `API_URL_PROD`
- ไฟล์สำรองข้อมูลก่อนเริ่มใช้จริง (3 พ.ย. 2026): "Maintenance – สำรองก่อนเริ่มใหม่ 3 พ.ย. 2026" มีงานเก่าจากไฟล์ Excel และงานทดสอบ

## 3. ไฟล์ใน repo

### 3.1 `gas/` หลังบ้าน (Google Apps Script)

ทุกไฟล์อยู่ใน global scope เดียวกัน ชื่อฟังก์ชันขึ้นต้นด้วยชื่อไฟล์ เช่น `Jobs_create` อยู่ใน `Jobs.js`

| ไฟล์ | ทำอะไร | ฟังก์ชันหลัก |
|---|---|---|
| `Main.js` | ทางเข้าของ Web App แยกว่าเป็น webhook จาก LINE หรือ API จากหน้าเว็บ | `doGet`, `doPost` |
| `Api.js` | API ของหน้า LIFF: ตรวจ ID token กับ LINE, หาว่าใครเรียก แล้วส่งต่อไป `Jobs_*` | `Api_handle` |
| `Webhook.js` | รับ event จาก LINE: เพิ่มเพื่อน, บล็อก, ข้อความ ("ping", "งานของฉัน", เลขงาน) และปุ่มในการ์ด (รับงาน, รับทราบ, อนุมัติเลื่อน) ตอบด้วย reply ซึ่งไม่เสียโควตา | `Webhook_handle` |
| `Jobs.js` | use-case ทุกอย่างของงาน: ลงทะเบียน, แจ้ง, รับ, ปฏิเสธ, ส่งต่อ, จ่ายงาน, Check-in, ปิด, รับทราบ, ขอเลื่อน, แก้ความเร่งด่วน, ยกเลิก, Dashboard รวมถึงการส่งการ์ดหลังเปลี่ยนสถานะ | `Jobs_create`, `Jobs_transition_`, `Jobs_dashboard`, `Jobs_notify_` |
| `Repo.js` | อ่านและเขียนชีต อ้างคอลัมน์ด้วยชื่อหัวตาราง ครอบทุกการเขียนด้วย lock เขียนเฉพาะช่องที่เปลี่ยน และฝังลิงก์รูปทีละบรรทัด | `Repo_readAll`, `Repo_update`, `Repo_appendRows`, `Repo_nextJobId` |
| `Drive.js` | เก็บรูปและวิดีโอลง Drive (โฟลเดอร์รายเดือน) ตั้งสิทธิ์ "ทุกคนที่มีลิงก์ดูได้" และสร้าง URL | `Drive_savePhotos`, `Drive_saveVideo`, `Drive_thumbnailUrl` |
| `Line.js` | เรียก LINE API: reply, push (นับโควตา) และตรวจ ID token | `Line_reply`, `Line_push`, `Line_verifyIdToken` |
| `Flex.js` | สร้างการ์ด LINE ทุกแบบ: งานใหม่, รับงานแล้ว, ปฏิเสธ, ซ่อมเสร็จ, ขอเลื่อน, เตือน SLA, งานของฉัน, ต้อนรับ | `Flex_jobNew`, `Flex_jobDone`, `Flex_slaAlerts` |
| `Triggers.js` | `Sla_tick` ทำงานทุก 15 นาที: เตือนงานใกล้หรือเกินกำหนด ปิดงานอัตโนมัติ (ถ้าเปิดไว้) และเติมลิงก์รูปของงานเก่า | `Sla_tick`, `Triggers_install` |
| `Ops.js` | ส่งสถานะสรุปไป Ops Hub ท้าย `Sla_tick` ทุกรอบ และส่ง error เมื่อ `Sla_tick` ล้ม (ไม่ตั้ง `OPS_*` = ไม่ส่ง) | `Ops_heartbeat_`, `Ops_error_`, `Ops_test` |
| `Setup.js` | งานตั้งค่าที่รันจาก editor: สร้างชีตและแท็บ, ตรวจระบบ, ยกเลิกงานค้าง, นำเข้างานเก่า | `Setup_init`, `Setup_check`, `Setup_cancelStaleRun`, `Setup_migrateLegacyRun` |
| `Dev.js` | ตัวช่วยทดสอบ รันได้เฉพาะ `ENV = test` | `Dev_smokeTest`, `Dev_slaDemo` |
| `appsscript.json` | ตั้งค่าโปรเจกต์: V8, Asia/Bangkok, Web App เปิดให้ทุกคนเรียก | — |

### 3.2 `gas/core/` กติกาล้วน (ไม่เรียกบริการ Google และเทสต์ด้วย Node ได้)

| ไฟล์ | ทำอะไร | เทสต์ |
|---|---|---|
| `Status.js` | state machine และ**ตารางสิทธิ์ทั้งหมด** (`STATUS_RULES`) บอกว่าใครทำอะไรได้ในสถานะไหน, ปุ่มไหนแสดงในหน้างาน และใครเห็นงานไหน | `status.test.js`, `status-phase2.test.js` |
| `Routing.js` | งานใหม่ส่งให้ใคร: ตาม `route_to` ของหมวด (TECH / ADMIN / BOTH) หรือตามช่างประจำหมวด (`assignee_user_id`) | `routing.test.js` |
| `Sla.js` | คำนวณกำหนดเข้าหน้างานและกำหนดเสร็จ และหาว่างานไหนถึงเวลาเตือน (75% และเกินกำหนด) | `sla.test.js` |
| `Notify.js` | ใครได้การ์ดเสริม: รับงานแล้ว (ผู้แจ้ง), ซ่อมเสร็จ (ผู้จัดการร้าน), รับทราบแล้ว (ช่าง) | `notify.test.js` |
| `JobId.js` | รูปแบบเลขงาน `MT-YYMM-NNNN` | `jobid.test.js` |
| `Kpi.js` | ตัวเลขทั้งหมดของ Dashboard | `kpi.test.js` |
| `Links.js` | แยก URL ทีละบรรทัด เพื่อให้กดเปิดรูปในชีตได้ | `links.test.js` |
| `Media.js` | ตรวจวิดีโอ: ชนิดไฟล์ MP4 หรือ MOV เนื้อไฟล์ และขนาดตาม `VIDEO_MAX_MB` | `media.test.js` |
| `Migrate.js` | แปลงงานจากไฟล์ Excel เดิมเป็นแถว Jobs และเลือกงานค้างที่จะยกเลิก | `migrate.test.js` |

### 3.3 `web/` หน้าเว็บ LIFF (HTML + JS ธรรมดา ไม่มี framework)

| ไฟล์ | หน้า | ใครใช้ |
|---|---|---|
| `register.html` | ลงทะเบียน (ชื่อ, เบอร์, ร้าน) | ทุกคนครั้งแรก |
| `report.html` | แจ้งซ่อม (ร้าน, จุด, หมวด, ความเร่งด่วน, รูป, วิดีโอ) | ทุกคนยกเว้น VIEWER |
| `jobs.html` | งานของฉัน | ทุกคน (เห็นเฉพาะงานในขอบเขตของตัวเอง) |
| `job.html` | รายละเอียดงาน พร้อมปุ่มตามสิทธิ์ (รับ, Check-in, ปิด, รับทราบ, ขอเลื่อน ฯลฯ) | ทุกคน |
| `admin.html` | รายการงานรอจ่าย, จ่ายงาน, เลือกช่างนอก, แก้ความเร่งด่วน, อนุมัติเลื่อน, ยกเลิก | ADMIN |
| `dashboard.html` | Dashboard KPI (ใช้ Chart.js) | ADMIN, VIEWER |
| `index.html` | endpoint ของ LIFF: `liff.init()` พาจาก `liff.line.me/<LIFF_ID>/<หน้า>.html` ไปหน้านั้น | — |
| `ping.html` | หน้าตรวจว่าเว็บเรียก API ได้ | ผู้ดูแล |
| `js/config.js` | LIFF ID และ API URL (ค่าของ test ตอน deploy prod ถูกแทนที่) | — |
| `js/liff.js` | เริ่ม LIFF และล็อกอิน ทุกหน้าเรียกใช้ | — |
| `js/api.js` | เรียก API ของ Apps Script พร้อม ID token | — |
| `js/image.js` | ปุ่มถ่ายรูปหรือเลือกจากคลังภาพ ย่อรูปเป็น JPEG ก่อนอัปโหลด และปุ่มวิดีโอ (ตรวจขนาดก่อนส่ง) | — |
| `js/ui.js` | ตัวช่วยสร้างหน้า (ใช้ `textContent` เสมอ เพื่อกันโค้ดแปลกปลอมในข้อความ) | — |
| `css/app.css` | สไตล์กลางของทุกหน้า | — |

### 3.4 ไฟล์อื่น

| ไฟล์ | ทำอะไร |
|---|---|
| `tests/*.test.js` | unit test ของ `gas/core/` รันด้วย `node --test` |
| `.github/workflows/deploy-gas.yml` | push ขึ้น `main` แล้ว deploy Apps Script ไป **test** ส่วน prod ต้องสั่งรันเองด้วย `target=prod` |
| `.github/workflows/deploy-web.yml` | push ขึ้น `main` แล้ว deploy หน้าเว็บทั้ง prod (`/`) และ test (`/test/`) **ทันที** |
| `.clasp.json` | ผูก repo กับโปรเจกต์ Apps Script (`rootDir: gas`) |
| `assets/richmenu.png` | รูป rich menu ของ OA |
| `CLAUDE.md` | กติกาของโปรเจกต์สำหรับ Claude Code |
| `docs/PLAN.md` | สเปกเทคนิค (แหล่งความจริงหลัก) |
| `docs/REQUIREMENTS.md` | สิ่งที่พี่แตงกวาต้องการ และคำถามที่ยังเปิด |
| `docs/SETUP.md` | ขั้นตอนที่ต้องกดเองในเว็บ LINE, Google และ GitHub |
| `docs/PROMPTS.md` | ลำดับคำสั่งของแต่ละเฟส |
| `docs/TEST_PHASE1.md` | แผนทดสอบเฟส 1 |
| `docs/SYSTEM.md` | ไฟล์นี้ |

## 4. Google Sheet (แต่ละแท็บ)

| แท็บ | เก็บอะไร | ใครแก้ |
|---|---|---|
| Jobs | งานทุกงาน แถวละงาน (45 คอลัมน์ ดู PLAN §4) | ระบบ |
| JobLog | ประวัติทุกการเปลี่ยนสถานะ: ใคร, เมื่อไหร่, เหตุผล | ระบบ |
| Parts | รายการอะไหล่และค่าใช้จ่ายตอนปิดงาน | ระบบ |
| Users | ผู้ใช้: `role`, `branch_code`, `active` | ระบบเพิ่มตอนลงทะเบียน **AOF แก้ role และร้าน** |
| Branches | รายชื่อร้าน | แก้มือได้ |
| Areas | จุดในร้าน (`*` = ใช้ทุกร้าน) | แก้มือได้ |
| Categories | หมวดงาน, `route_to` และช่างประจำหมวด | แก้มือได้ (ห้ามเปลี่ยนรหัสเดิม) |
| SLA | ชั่วโมงเข้าหน้างานและชั่วโมงซ่อมเสร็จ ตามความเร่งด่วน | แก้มือได้ |
| Vendors | ช่างนอกและผู้รับเหมา | แก้มือได้ |
| Config | สวิตช์ของระบบ เช่น บังคับรูป และการ์ดแจ้งผู้แจ้ง (ดู PLAN §4) | แก้มือได้ |
| WebhookLog | log ของ webhook (เฉพาะ test) | ระบบ |
| Budget, PM_Plan | งบต่อร้าน และแผนบำรุงรักษา (เฟส 3 ยังไม่ใช้) | — |

- แท็บที่แก้มือ ระบบจำค่าไว้ 5 นาที แก้แล้วรอไม่เกิน 5 นาทีจึงมีผล
- แท็บ Users ไม่ถูกจำค่า แก้แล้วมีผลทันที แต่หน้าเว็บของผู้ใช้จะเห็นสิทธิ์ใหม่ตอนเปิดหน้าถัดไป

## 5. ความลับ (Script Properties)

เก็บใน Apps Script → Project Settings → Script Properties เท่านั้น ห้ามใส่ใน repo หรือ `web/`

`LINE_CHANNEL_ACCESS_TOKEN`, `LINE_LOGIN_CHANNEL_ID`, `LIFF_ID`, `WEBHOOK_KEY`, `WEB_BASE_URL`, `SHEET_ID`, `DRIVE_FOLDER_ID`

Ops Hub (ไม่บังคับ): `OPS_HUB_URL`, `OPS_TOKEN`, `OPS_SYSTEM_ID` (`maintenance-prod` หรือ `maintenance-test`) ดู PLAN §5

ระบบตั้งค่าเหล่านี้เอง: `JOB_SEQ_YYMM` (ตัวนับเลขงานรายเดือน), `PHOTO_LINKS_BACKFILLED`, `PHOTO_LINKS_RICH_BACKFILLED`

## 6. งานหนึ่งงานวิ่งผ่านไฟล์ไหนบ้าง

**แจ้งซ่อม**

1. `report.html` ย่อรูปด้วย `image.js` แล้วส่งให้ API ผ่าน `api.js`
2. `Api.js` ตรวจ ID token แล้วเรียก `Jobs_create`
3. ใน `Jobs_create`:
   - ตรวจข้อมูล และเก็บรูปด้วย `Drive.js`
   - ออกเลขงานด้วย `Repo_nextJobId`
   - หาคนรับงานด้วย `core/Routing.js` และคำนวณกำหนดเวลาด้วย `core/Sla.js`
4. `Repo.js` เขียนแถวลง Jobs และ JobLog
5. `Flex_jobNew` สร้างการ์ด แล้ว `Line_push` ส่งให้ช่างหรือ ADMIN
6. หน้าเว็บส่งเลขงานกลับเข้าแชท แล้ว `Webhook.js` ตอบการ์ด "รับเรื่องแล้ว" ด้วย reply

**กดปุ่มในการ์ด (เช่น รับงาน, รับทราบ)**

1. LINE ส่ง postback มาที่ `Webhook.js`
2. `Jobs_accept` หรือ `Jobs_ack` เรียก `Jobs_transition_`
3. `Status_transition` ใน `core/Status.js` ตรวจสถานะและสิทธิ์
4. `Repo_update` เขียนลงชีต และ JobLog ได้ 1 แถว
5. reply ผลกลับ และ push การ์ดต่อไปถ้ามี

**ทุก 15 นาที**

1. `Sla_tick` ใน `Triggers.js` หาว่างานไหนถึงเวลาเตือนด้วย `core/Sla.js`
2. รวมเป็นการ์ดเดียวต่อคน แล้ว push
3. บันทึก flag ลงคอลัมน์ `alert_flags` กันเตือนซ้ำ

## 7. อยากแก้เรื่องนี้ ต้องแก้ที่ไหน

| อยากแก้ | แก้ที่ | ต้อง deploy ไหม |
|---|---|---|
| เพิ่มหรือเปลี่ยนชื่อหมวด, หมวดนี้ส่งให้ใคร | แท็บ Categories | ไม่ต้อง |
| ให้หมวดหนึ่งส่งให้ช่างคนเดียว | Categories → `assignee_user_id` (ใส่ LINE user ID) | ไม่ต้อง |
| เวลา SLA ของแต่ละความเร่งด่วน | แท็บ SLA | ไม่ต้อง |
| เพิ่มร้าน, จุดในร้าน, ช่างนอก | Branches / Areas / Vendors | ไม่ต้อง |
| ตั้งคนเป็น ADMIN, MANAGER, TECH หรือปิดผู้ใช้ | แท็บ Users | ไม่ต้อง |
| ปิดการบังคับรูป, ปิดการ์ดแจ้งผู้แจ้ง (ประหยัดโควตา) | แท็บ Config | ไม่ต้อง |
| ใครกดอะไรได้ (สิทธิ์) | `gas/core/Status.js` (`STATUS_RULES`) + เทสต์ | ต้อง (Apps Script) |
| กติกาการส่งงาน | `gas/core/Routing.js` + เทสต์ | ต้อง (Apps Script) |
| ข้อความหรือหน้าตาการ์ด LINE | `gas/Flex.js` | ต้อง (Apps Script) |
| ใครได้การ์ดไหน | `gas/core/Notify.js` และ `Jobs_notify*` ใน `gas/Jobs.js` | ต้อง (Apps Script) |
| ตัวเลขใน Dashboard | `gas/core/Kpi.js` + เทสต์ | ต้อง (Apps Script) |
| หน้าตาหรือช่องในหน้าเว็บ | `web/*.html`, `web/css/app.css` | ต้อง (push แล้ว prod เปลี่ยนทันที) |
| ปุ่มใน rich menu | LINE OA Manager → Rich menu | ไม่ต้อง (กดในเว็บ) |

## 8. คำสั่งและการ deploy

```bash
node --test        # รันเทสต์ทั้งหมดที่ root ของ repo
git push           # deploy Apps Script ไป test และหน้าเว็บทั้ง prod/test
```

**deploy Apps Script ขึ้น prod:** ต้องได้คำอนุญาตก่อนทุกครั้ง

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" workflow run deploy-gas.yml --repo Sitthisak17SM/maintenance-line -f target=prod
```

**ฟังก์ชันที่รันเองใน Apps Script editor**

| ฟังก์ชัน | ใช้เมื่อ |
|---|---|
| `Setup_check` | ตรวจระบบ: Script Properties ครบไหม, token ใช้ได้ไหม, webhook ล่าสุดทำอะไร |
| `Setup_init` | สร้างหรือซ่อมแท็บและหัวตาราง (รันซ้ำได้ ไม่ลบข้อมูล) |
| `Triggers_install` | ติดตั้ง `Sla_tick` ทุก 15 นาที (ครั้งเดียวต่อ environment) |
| `Jobs_backfillPhotoLinks` | เติมลิงก์รูปในชีตใหม่ทั้งหมด |
| `Setup_cancelStaleDryRun` / `Setup_cancelStaleRun` | ดูหรือยกเลิกงานค้างจากระบบเดิม |
| ~~`Setup_migrateLegacyRun`~~ | **ห้ามรันอีก** งานเก่าจะถูกนำเข้ากลับมา (ล้างข้อมูลไปแล้ว 3 พ.ย. 2026) |
| `Dev_*` | ทดสอบ ใช้ได้เฉพาะ test |
