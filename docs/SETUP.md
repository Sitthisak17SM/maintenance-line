# SETUP: ขั้นตอนที่ต้องทำเอง

Claude Code ทำขั้นตอนเหล่านี้แทนไม่ได้ เพราะต้องล็อกอินหรือกดยืนยันในเว็บ

**ข้อควรระวัง**

- ห้ามวาง token ในแชทกับ Claude Code
- ใส่ token เองใน Script Properties หรือ GitHub Secrets เท่านั้น
- ค่าที่ไม่ใช่ความลับ เช่น LIFF ID และ Web App URL บอก Claude Code ได้

## 0. เครื่องที่ใช้พัฒนา (ก่อนเฟส 0)

- [ ] ติดตั้ง Node.js 22 ขึ้นไป (เช็คด้วย `node -v`) เพราะ clasp รุ่นปัจจุบันกำหนดไว้
- [ ] ติดตั้ง clasp ด้วย `npm install -g @google/clasp`
- [ ] มี Git และ VS Code ที่ติดตั้ง extension Claude Code แล้ว

## A. Google (เฟส 0)

- [ ] **เลือกบัญชี Google ที่จะเป็นเจ้าของระบบ**
    - แนะนำบัญชีกลางของบริษัทแทนบัญชีส่วนตัว
    - เหตุผล: Web App จะรันด้วยสิทธิ์ของบัญชีนี้
- [ ] **เปิด Google Apps Script API** ที่ https://script.google.com/home/usersettings
- [ ] **ล็อกอิน clasp:** รัน `clasp login` แล้วกดอนุญาตในเบราว์เซอร์ที่เปิดขึ้นมา
- [ ] **หลัง Claude Code สร้างโปรเจกต์และ push โค้ดแล้ว**
    - รัน `clasp open-script` เพื่อเปิด editor
    - รันฟังก์ชัน `Setup_init` 1 ครั้ง แล้วกดอนุญาตสิทธิ์ (Sheets, Drive, การเรียก URL ภายนอก)
- [ ] **ใส่ Script Properties** ที่ Project Settings → Script Properties ตามรายการใน PLAN §5 (`LINE_*` กับ `LIFF_ID` ใส่ได้หลังทำข้อ B)
    - สร้างค่า `WEBHOOK_KEY` ด้วยคำสั่ง `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
- [ ] **Deploy เป็น Web App**
    - กด Deploy → New deployment → Web app
    - ตั้ง Execute as: Me และ Who has access: Anyone
    - จด Web App URL กับ Deployment ID ไว้

## B. LINE (เฟส 0)

- [ ] **สร้าง LINE Official Account สำหรับทดสอบ** ที่ LINE Official Account Manager (manager.line.biz) เช่นตั้งชื่อว่า "แจ้งซ่อม (ทดสอบ)"
- [ ] **เปิด Messaging API ใน OA Manager**
    - ไปที่ Settings → Messaging API → Enable แล้วเลือก Provider
    - Provider เปลี่ยนทีหลังไม่ได้ ให้ใช้ Provider เดียวกันกับทุก channel ของระบบนี้
    - ตั้งแต่ 4 ก.ย. 2024 LINE ไม่ให้สร้าง Messaging API channel จาก LINE Developers Console โดยตรงแล้ว
- [ ] **ตั้งค่าการตอบกลับใน OA Manager:** เปิด Webhook, ปิดข้อความตอบกลับอัตโนมัติ และปิดข้อความทักทาย เพราะระบบจะตอบเอง
- [ ] **ออก access token** ที่ LINE Developers Console (developers.line.biz)
    - เลือก Provider เดิม → channel Messaging API → แท็บ Messaging API
    - กด Issue channel access token (long-lived)
    - นำไปใส่ใน Script Properties ชื่อ `LINE_CHANNEL_ACCESS_TOKEN`
- [ ] **สร้าง LINE Login channel**
    - ที่ Provider เดิม เลือก Create a new channel → LINE Login → App types: Web app
    - จด Channel ID ไว้ใส่ใน `LINE_LOGIN_CHANNEL_ID`
- [ ] **เพิ่ม LIFF app** ที่แท็บ LIFF ของ LINE Login channel แล้วกด Add
    - Size: Full
    - Endpoint URL: `https://<github-user>.github.io/<repo>/` (ต้องเป็น https ใช้ได้หลังทำข้อ C)
    - Scopes: `openid`, `profile`, `chat_message.write`
    - Add friend option: On (aggressive) เพื่อให้ผู้ใช้เพิ่มเพื่อน OA ตอนเปิดครั้งแรก
    - จด LIFF ID ไว้ใส่ทั้งใน `LIFF_ID` และ `web/js/config.js`
- [ ] **ตั้ง Webhook** หลังได้ Web App URL จากข้อ A
    - ที่แท็บ Messaging API ใส่ Webhook URL เป็น `<WEB_APP_URL>?key=<WEBHOOK_KEY>`
    - เปิด Use webhook
    - กด Verify แล้วจดผลไว้ อาจขึ้น error 302 ได้ ไม่เป็นไรถ้าทดสอบ ping ผ่าน
    - ถ้ามีตัวเลือก Webhook redelivery ให้ปิดไว้
- [ ] **เพิ่มเพื่อน OA ทดสอบ** ด้วยมือถือ โดยสแกน QR จาก OA Manager

## C. GitHub (เฟส 0)

- [ ] **สร้าง repo** เช่น `maintenance-line`
    - ถ้าใช้ GitHub Free ต้องเป็น public เพราะ Pages ฟรีใช้ได้กับ repo สาธารณะเท่านั้น
    - repo จึงห้ามมีความลับ
- [ ] **เปิด Pages** ที่ Settings → Pages → Source: GitHub Actions
- [ ] **ตั้ง secrets** ที่ Settings → Secrets and variables → Actions → New repository secret
    - `CLASPRC_JSON`: เนื้อหาไฟล์ `~/.clasprc.json` หลัง `clasp login` ไฟล์นี้เข้าถึงบัญชี Google ได้ ห้ามเผยแพร่
    - `DEPLOYMENT_ID`: Deployment ID ของ Web App ทดสอบ
- [ ] **ใส่ค่าใน `web/js/config.js`:** `LIFF_ID` และ `API_URL` (Web App URL) ค่าทั้งสองไม่ใช่ความลับ

## D. Rich menu (เฟส 1)

- [ ] **สร้าง rich menu 2 ปุ่ม** ใน OA Manager → Rich menu
    - "แจ้งซ่อม" ลิงก์ไปที่ `https://liff.line.me/<LIFF_ID>/report.html`
    - "งานของฉัน" ลิงก์ไปที่ `https://liff.line.me/<LIFF_ID>/jobs.html`
    - รูปเมนูทำใน Canva หรือใช้ template ใน OA Manager ก็ได้

## E. ก่อน pilot (ปลายเฟส 1)

- [ ] **ทำชุด prod แยก** ได้แก่ OA จริง, Apps Script ตัวใหม่ (รัน `Setup_init` เพื่อสร้างชีตจริง), Web App ตัวใหม่ และ LIFF app ตัวที่สองใน LINE Login channel เดิม
    - ให้ LIFF prod ชี้ไปที่ `/` และย้าย LIFF ทดสอบไปที่ `/test/` ตาม PLAN §16
- [ ] **เปลี่ยน LINE Login channel เป็น Published** เพราะระหว่างที่เป็น Developing จะล็อกอินได้เฉพาะ Admin และ Tester ของ channel
- [ ] **ให้คนใช้งานจริงเริ่มใช้:** พี่แตงกวา ช่างอาคาร และผู้จัดการร้านที่ทดลองใช้ เพิ่มเพื่อน OA แล้วลงทะเบียน
- [ ] **ตั้ง role ในแท็บ Users**
    - ADMIN: พี่แตงกวา
    - TECH: ช่างอาคาร
    - MANAGER: ผู้จัดการร้าน
- [ ] **ตรวจแพ็กเกจ LINE OA:** แพ็กเกจ Free ส่งได้ 300 ข้อความต่อเดือน ระบบใช้ราว 2–3 ข้อความต่องาน
