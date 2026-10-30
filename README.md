# Maintenance LINE

ระบบแจ้งซ่อมผ่าน LINE OA สำหรับร้านในเครือ 7 ร้าน

- Backend: Google Apps Script (`gas/`) จัดการด้วย clasp
- Database: Google Sheet + รูปใน Google Drive
- Frontend: LIFF (`web/`) บน GitHub Pages

เอกสาร: [docs/PLAN.md](docs/PLAN.md) (สเปก), [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md), [docs/SETUP.md](docs/SETUP.md) (ขั้นตอนที่ต้องทำเอง), [docs/PROMPTS.md](docs/PROMPTS.md)

## คำสั่ง (รันที่ root)

```bash
node --test                               # unit test ของ gas/core/
clasp push                                # ส่งโค้ด gas/ ขึ้น Apps Script
clasp update-deployment <DEPLOYMENT_ID>   # อัปเดต Web App เดิม
clasp open-script                         # เปิด editor
npx serve web                             # ดูหน้าเว็บในเครื่อง
```

ต้องใช้ Node.js 22 ขึ้นไป ห้าม commit `~/.clasprc.json` และห้ามใส่ความลับใน `web/`
