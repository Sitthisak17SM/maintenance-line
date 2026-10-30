---
name: phase-0
description: "เฟส 0 ระบบแจ้งซ่อม LINE OA วางโครง repo และพิสูจน์ว่า webhook ทำงาน"
disable-model-invocation: true
effort: medium
---

อ่าน docs/PLAN.md และ docs/SETUP.md แล้วทำ "เฟส 0: วางโครงและพิสูจน์ webhook"
เสนอแผนให้ผมดูก่อนลงมือ

**เป้าหมาย:** พิสูจน์ว่า LINE OA → Apps Script Web App → Google Sheet ทำงานได้จริง และวางโครง repo ตาม PLAN §15

## งาน

1. **โครง repo:** สร้างตาม PLAN §15 (ไฟล์ที่ยังไม่ใช้ให้มีแค่โครงฟังก์ชัน) พร้อม README.md และ .gitignore ห้าม commit `.clasprc.json` และ `node_modules`
2. **โปรเจกต์ Apps Script:**
    - สร้างแบบ standalone ด้วย `clasp create-script --type webapp --title "Maintenance LINE (test)" --rootDir gas` (ผมจะทำ `clasp login` ให้ก่อน)
    - ตั้ง `gas/appsscript.json`: V8, timeZone `Asia/Bangkok`, webapp executeAs `USER_DEPLOYING`, access `ANYONE_ANONYMOUS`
3. **`gas/Setup.js`:** เขียน `Setup_init()` ให้
    - สร้าง Spreadsheet ทุกแท็บ พร้อมหัวคอลัมน์และข้อมูลตั้งต้นตาม PLAN §4
    - สร้างโฟลเดอร์ Drive
    - เก็บ `SHEET_ID` และ `DRIVE_FOLDER_ID` ไว้ใน Script Properties
    - ถ้ามีอยู่แล้วให้ข้าม ห้ามสร้างซ้ำ และห้ามลบข้อมูล
4. **`gas/Main.js`, `Webhook.js`, `Line.js`**
    - `doPost` แยก webhook (มี `?key=`) ออกจาก API ตาม PLAN §6–7
    - **webhook:**
        - ตรวจ `WEBHOOK_KEY` และกันซ้ำด้วย `webhookEventId`
        - บันทึกลงแท็บ WebhookLog เฉพาะตอน ENV=test
        - ข้อความ "ping" ให้ reply "pong" ส่วน follow ให้ reply ข้อความต้อนรับ
        - ตอบกลับด้วย `HtmlService.createHtmlOutput('OK')`
    - **API:** action `ping` (ไม่ต้องมี token) และ `whoami` (ตรวจ ID token กับ LINE ตาม PLAN §6 แล้วคืน userId กับ displayName)
5. **Logic ล้วน:** `gas/core/JobId.js` และ `gas/core/Sla.js` (`Sla_computeDueDates`) พร้อม `tests/*.test.js` ที่รันด้วย `node --test`
6. **หน้าเว็บ:**
    - `web/index.html` เป็น LIFF endpoint ตาม PLAN §9
    - `web/ping.html` เรียก liff.init → getIDToken → whoami แล้วแสดงผล
    - `web/js/config.js`, `liff.js`, `api.js`
7. **Workflow:** เขียน `.github/workflows/deploy-web.yml` (Pages) และ `deploy-gas.yml` (node --test → clasp push -f → clasp update-deployment) ตาม PLAN §16 ใช้ secrets `CLASPRC_JSON` และ `DEPLOYMENT_ID`
8. **จุดที่ผมต้องกดเองในเว็บ:** บอกเป็นขั้นตอนโดยอ้างหัวข้อใน docs/SETUP.md แล้วหยุดรอ

## เกณฑ์ผ่าน (ผมจะทดสอบเอง)

- [ ] `node --test` ผ่าน
- [ ] รัน `Setup_init` แล้วได้ชีตครบทุกแท็บ หัวคอลัมน์ตรงกับ PLAN §4 และรันซ้ำแล้วไม่สร้างซ้ำ
- [ ] พิมพ์ "ping" ในแชท OA ทดสอบแล้วได้ "pong" กลับ และมีแถวใน WebhookLog
- [ ] event เดียวกันไม่ถูกบันทึกซ้ำ
- [ ] จดผลปุ่ม Verify ใน LINE Developers (200 หรือ error) ลงตาราง PLAN §18
- [ ] เปิด `https://liff.line.me/<LIFF_ID>/ping.html` ในแอป LINE แล้วเห็น userId และชื่อของตัวเอง
- [ ] push ขึ้น main แล้ว GitHub Actions deploy ทั้ง web และ gas สำเร็จ

$ARGUMENTS
