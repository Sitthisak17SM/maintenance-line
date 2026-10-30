# PROMPTS: คำสั่งทีละเฟส และ effort ที่ตั้งไว้

## ทำงานอย่างไร

- **แต่ละเฟสเป็น skill:** อยู่ใน `.claude/skills/<ชื่อ>/SKILL.md` และพิมพ์ `/<ชื่อ>` ใน Claude Code เพื่อเรียกใช้
- **effort ตั้งไว้ใน frontmatter:** ทุกไฟล์มีบรรทัด `effort:` ระบบจะใช้ค่านั้นตลอดที่ skill ทำงาน แล้วกลับไปใช้ค่าของ session เอง (ค่าเริ่มต้นของ Opus 5.5 คือ `medium`)
- **ไม่ต้องคัดลอกคำสั่ง:** พิมพ์ข้อความเพิ่มต่อท้ายคำสั่งได้ เช่น `/phase-1-core เริ่มจาก core/Status.js ก่อน` ข้อความนั้นจะถูกส่งไปด้วย
- **ตั้งให้เรียกได้เฉพาะเมื่อพิมพ์เอง:** ทุก skill ใส่ `disable-model-invocation: true` ไว้ Claude จึงเปิด skill เองไม่ได้

## คำสั่ง

| ลำดับ | คำสั่ง | effort | ทำอะไร |
|---|---|---|---|
| 1 | `/phase-0` | medium | วางโครง repo และพิสูจน์ว่า webhook ทำงาน |
| 2 | `/phase-1-core` | high | หลังบ้านของ MVP: state machine, สิทธิ์, routing, API, webhook, การ์ด |
| 3 | `/phase-1-ui` | medium | หน้า LIFF และทดสอบทั้งระบบ |
| 4 | `/review-against-plan` | high ทุก agent | workflow ตรวจทั้ง repo เทียบ PLAN.md แล้วให้อีก agent พยายามหักล้างทุกข้อที่เจอ |
| 5 | `/phase-2-core` | high | ขอเลื่อน, แก้ความเร่งด่วน, ยกเลิก, เตือน SLA, ย้ายข้อมูลเก่า, prod |
| 6 | `/phase-2-dashboard` | medium | Dashboard KPI |
| 7 | `/review-against-plan` | high ทุก agent | ตรวจอีกรอบก่อน deploy prod |
| 8 | `/phase-3-plan` | medium | วางแผนงานต่อยอด (ยังไม่ลงมือ) |
| ทุกเฟส | `/fix-bug <อาการหรือ error>` | high | แก้ bug เป็นขั้นตอน ถ้า 2 รอบยังไม่หายจะบอกให้เพิ่มเป็น `xhigh` |
| จบเฟส | `/wrap-up` | low | สรุปสิ่งที่ทำ ผลเทสต์ และ checklist ที่ต้องทดสอบเอง |

## เรื่อง ultracode

- **`/review-against-plan` เป็น workflow ที่บันทึกไว้แล้ว:** อยู่ที่ `.claude/workflows/review-against-plan.js` พิมพ์คำสั่งนี้แล้วรันได้เลย ไม่ต้องพิมพ์คำว่า ultracode และไม่ต้องเปิด ultracode ทั้ง session
- **ขนาด:** มี reviewer 5 ตัว และ skeptic ไม่เกิน 25 ตัว ใช้ token มากกว่าคำสั่งปกติหลายเท่า จึงควรรันแค่ตอนจบเฟส
- **ตรวจเฉพาะบางส่วน:** พิมพ์ต่อท้ายคำสั่ง เช่น `/review-against-plan gas/Api.js`
- **เฉพาะแพ็กเกจ Pro:** ต้องเปิด Dynamic workflows ใน `/config` ก่อน
- **คำว่า ultracode ใส่ในไฟล์ skill ไม่ได้ผล:** ระบบเริ่ม workflow จากคำนี้เฉพาะเมื่อคนพิมพ์เองในช่องข้อความ ถ้าต้องการให้ Claude ออกแบบ workflow ใหม่ ให้พิมพ์ `ultracode:` นำหน้าคำสั่งเอง

## ปรับ effort ชั่วคราว

- **ทั้ง session:** พิมพ์ `/effort xhigh` หรือระดับอื่น ค่านี้จะถูกบันทึกเป็นค่าเริ่มต้นด้วย พิมพ์ `/effort auto` เพื่อกลับไปใช้ค่าปกติ
- **ระหว่างที่ skill ทำงาน:** frontmatter ของ skill มีลำดับสูงกว่า `/effort` ถ้าต้องการค่าอื่นให้แก้บรรทัด `effort:` ในไฟล์ SKILL.md แล้วพิมพ์ `/reload-skills`
- **บังคับค่าเดียวทุกที่:** ตั้ง environment variable `CLAUDE_CODE_EFFORT_LEVEL` ซึ่งมีลำดับสูงกว่า frontmatter

## เคล็ดลับ

- **ถ้า Claude Code ขอ token:** ตอบว่า "ใส่เองใน Script Properties แล้ว" อย่าวาง token ในแชท
- **เวลาเจอ bug:** คัดลอก error จาก Apps Script (Executions) หรือจาก GitHub Actions ไปใส่ต่อท้าย `/fix-bug`
- **เมื่อพี่แตงกวาตอบคำถามแล้ว:** แก้ตารางใน `docs/REQUIREMENTS.md` แล้วสั่งว่า "อัปเดตตาม REQUIREMENTS ที่แก้"
