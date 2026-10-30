# Maintenance LINE: คู่มือโปรเจกต์สำหรับ Claude Code

ระบบแจ้งซ่อมผ่าน LINE OA สำหรับร้านในเครือ 7 ร้าน (PPP, Tichuca, Sanctuary, Tahona, GIR, Scofflaws, Lloyd's)

ลำดับการทำงานของระบบ:

1. พนักงานแจ้งซ่อมพร้อมรูป
2. ระบบส่งงานให้ช่างทาง LINE
3. ช่างกดรับหรือปฏิเสธงาน
4. ช่างปิดงานพร้อมรูปและค่าใช้จ่าย
5. ผู้แจ้งกดรับทราบ
6. ข้อมูลทั้งหมดอยู่ใน Google Sheet และนำไปทำ Dashboard

อ่านเอกสารเหล่านี้ก่อนเริ่มงานทุกครั้ง:

- `docs/PLAN.md`: สเปกเทคนิค เป็นแหล่งความจริงหลัก (schema ชีต, สถานะงาน, API, การ์ด LINE, หน้า LIFF)
- `docs/REQUIREMENTS.md`: สิ่งที่ผู้ใช้ต้องการ คำถามที่ยังเปิดอยู่ และค่าเริ่มต้นที่ใช้ระหว่างรอคำตอบ
- `docs/SETUP.md`: ขั้นตอนที่คนต้องทำเองในเว็บ ห้ามพยายามทำแทน
- `.claude/skills/*/SKILL.md`: ขอบเขตและเกณฑ์ผ่านของแต่ละเฟส ผู้ใช้เรียกด้วย `/phase-0`, `/phase-1-core` และคำสั่งอื่นในโฟลเดอร์นั้น
- `docs/PROMPTS.md`: ลำดับคำสั่ง effort ที่ตั้งไว้ และ workflow สำหรับตรวจงาน

## Stack

- **Backend:** Google Apps Script (V8) แบบ Web App อยู่ใน `gas/` จัดการด้วย clasp
- **Database:** Google Sheet ไฟล์เดียว เก็บรูปใน Google Drive
- **Frontend:** HTML + vanilla JS + LIFF SDK v2 อยู่ใน `web/` และ deploy ขึ้น GitHub Pages
  - ไม่ใช้ framework หรือ bundler
  - โหลด LIFF SDK และ Chart.js จาก CDN
- **CI/CD:** GitHub Actions ใน `.github/workflows/`
- **Node.js:** ต้องใช้ 22 ขึ้นไป (clasp รุ่นปัจจุบันกำหนด) ใช้สำหรับ clasp และรัน unit test

## Commands

รันทุกคำสั่งที่ root ของ repo (`.clasp.json` อยู่ที่ root และตั้ง `"rootDir": "gas"` ไว้)

```bash
node --test                               # unit test ของ logic ใน gas/core/ (เทสต์อยู่ใน tests/*.test.js)
clasp push                                # ส่งโค้ดใน gas/ ขึ้น Apps Script (แทนที่โค้ดออนไลน์ทั้งหมด)
clasp update-deployment <DEPLOYMENT_ID>   # อัปเดต Web App เดิม URL ไม่เปลี่ยน
clasp open-script                         # เปิด editor (ใช้รัน Setup_init ครั้งแรกและอนุญาตสิทธิ์)
npx serve web                             # ดูหน้าเว็บในเครื่อง (LIFF ทดสอบจริงได้เฉพาะ https บน GitHub Pages)
```

## Conventions

- **ภาษา:** โค้ด ชื่อตัวแปร คอมเมนต์ และ commit ใช้ภาษาอังกฤษ ส่วนข้อความที่ผู้ใช้เห็น (หน้าเว็บและการ์ด LINE) ใช้ภาษาไทย
- **Apps Script ไม่มี import/export:** ทุกไฟล์ใน `gas/` อยู่ใน global scope เดียวกัน
  - ตั้งชื่อฟังก์ชันขึ้นต้นด้วยชื่อไฟล์ เช่น `Jobs_create`, `Line_push`, `Repo_findJob`
  - ระดับบนสุดของไฟล์มีได้แค่ค่าคงที่ ห้ามเรียกฟังก์ชันข้ามไฟล์ตอนโหลด (ลำดับโหลดไฟล์ไม่แน่นอน)
- **Logic ล้วนอยู่ใน `gas/core/`:** ได้แก่ state machine, SLA, routing, เลขงาน, KPI
  - ห้ามเรียก `SpreadsheetApp`, `UrlFetchApp` หรือบริการอื่นของ Google ในโฟลเดอร์นี้
  - ท้ายไฟล์ต้องมี `if (typeof module !== 'undefined') module.exports = { ... };` เพื่อให้ Node เทสต์ได้
- **เปลี่ยนสถานะงานผ่าน `Status_transition()` ใน `core/Status.js` เท่านั้น:** ฟังก์ชันนี้ตรวจตาม state machine ใน PLAN.md และทุกครั้งต้องเขียนแถวลง `JobLog`
- **อ่านและเขียนชีตผ่าน `Repo_*` เท่านั้น:**
  - อ้างคอลัมน์ด้วยชื่อหัวคอลัมน์ ห้ามใช้เลขคอลัมน์ตายตัว
  - การเขียนต้องครอบด้วย `LockService.getScriptLock()`
- **เวลา:** ใช้ timezone `Asia/Bangkok` เก็บลงชีตเป็นค่า Date
- **ความลับ:** อ่าน token และ secret จาก `PropertiesService.getScriptProperties()` เท่านั้น (รายชื่อ key อยู่ใน PLAN.md) ห้าม hardcode
- **`web/` ต้องไม่มีความลับ:** repo อาจเป็น public เพื่อใช้ GitHub Pages ฟรี ใส่ได้แค่ `LIFF_ID` กับ `API_URL` ใน `web/js/config.js`
- **ผู้ใช้จริงคือใคร:** user ID ต้องมาจาก LIFF ID token ที่ตรวจกับ LINE แล้ว หรือจาก webhook ที่ผ่าน `WEBHOOK_KEY` แล้ว ห้ามเชื่อ userId ที่หน้าเว็บส่งมาเอง

## Rules

- **ทำทีละเฟสตามคำสั่ง `/phase-*` ที่ผู้ใช้เรียก:** เสนอแผนก่อนลงมือ แบ่งงานย่อย และ commit ทีละงานย่อย ห้ามทำงานของเฟสถัดไปล่วงหน้า
- **ถ้า PLAN.md ไม่ได้ระบุ หรือขัดกับ REQUIREMENTS.md:** หยุดถามก่อน ห้ามเดา
- **ค่าที่ยังไม่คอนเฟิร์ม:** ใช้ค่าเริ่มต้นในเอกสาร และทำให้แก้ได้จากชีต (แท็บ Config, Categories, SLA, Areas) ห้าม hardcode
- **ชีต:** ทำงานกับชีตทดสอบเท่านั้น ห้ามลบหรือแก้ข้อมูลในชีตจริง
- **Deploy:** ห้าม deploy ทับ deployment จริง (prod) ถ้ายังไม่ได้รับอนุญาต
- **งานที่ต้องล็อกอินหรือกดในเว็บ** (LINE OA Manager, LINE Developers, Google, GitHub settings)
  - อธิบายเป็นขั้นตอนให้ผู้ใช้ทำเอง โดยอ้างหัวข้อใน `docs/SETUP.md`
  - หยุดรอเมื่อต้องใช้ค่าที่ผู้ใช้ต้องใส่เอง
  - ห้ามขอให้วาง token ในแชท
- **ประหยัดโควตาข้อความ LINE:** ใช้ reply (ไม่นับโควตา) ทุกครั้งที่ทำได้ และใช้ push เฉพาะการแจ้งเตือนตามตารางใน PLAN.md
- **จบแต่ละเฟส:**
  - รัน `node --test` ให้ผ่าน
  - อัปเดต PLAN.md ในส่วนที่เปลี่ยนจริง
  - สรุปรายการที่ผู้ใช้ต้องทดสอบตามเกณฑ์ผ่าน
