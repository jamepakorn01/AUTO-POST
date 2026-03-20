# ออกแบบระบบ Dynamic - ให้ User จัดการได้เอง

## เป้าหมาย

- **เพิ่ม User** ได้โดยไม่ต้องแก้โค้ด
- **เพิ่มกลุ่ม Facebook** ได้
- **เพิ่มงาน/สั่งงาน** ได้
- **User ทำได้ด้วยตัวเอง** — ไม่ต้องแก้ JSON หรือรันคำสั่งเทอร์มินัล

---

## ตัวเลือกการออกแบบ

### ตัวเลือก A: Google Sheets เป็น Admin (แนะนำ)

**เหตุผล:** ใช้โครงสร้างเดิม, User คุ้นเคยกับ Sheets, ไม่ต้องติดตั้งอะไรเพิ่ม

| ข้อดี | ข้อเสีย |
|-------|---------|
| ไม่ต้องเขียน UI ใหม่ | ต้องปรับ Apps Script |
| User แก้ไขได้ทันที | รหัสผ่านควรเก็บแยก (ความปลอดภัย) |
| ใช้ได้ทั้งมือถือ/คอม | จำกัดจำนวนแถว/ความเร็ว |

**โครงสร้าง Sheet:**

```
📊 Sheet: "Users"
| id | name | email | poster_name | sheet_url | blacklist_groups |
|----|------|-------|-------------|-----------|------------------|
| u1 | User 1 | xxx@... | หางาน สยามราชธานี | https://... | 1073449637181260,550295531832556 |

📊 Sheet: "Groups"  
| id | name | fb_group_id | province (optional) |
|----|------|-------------|---------------------|
| g1 | กลุ่มหางาน กทม | 583362260400984 | กรุงเทพฯ |
| g2 | กลุ่มหางาน ขอนแก่น | 1003334983479642 | ขอนแก่น |

📊 Sheet: "Jobs"
| id | title | owner | company | caption | apply_link | comment_reply | status |
|----|-------|-------|---------|---------|------------|---------------|--------|
| j1 | ขับรถ HRSA | คุณเล็ก | HRSA | รับสมัคร... | https://... | สนใจโทร... | pending |

📊 Sheet: "Assignments" (งานนี้ → โพสต์โดย User นี้ → ไปกลุ่มเหล่านี้)
| job_id | user_id | group_ids | created_at |
|--------|---------|-----------|------------|
| j1 | u1 | g1,g2,g3 | 2025-03-20 |
| j2 | u1 | g1,g4 | 2025-03-20 |
| j2 | u2 | g5,g6 | 2025-03-20 |
```

**Flow:**
1. User เพิ่ม/แก้ไขใน Sheets
2. Bot เรียก API: `GET /config` → ดึง Users, Groups, Jobs, Assignments
3. Bot แปลงเป็นโฟลว์เดิมแล้วรันโพสต์

---

### ตัวเลือก B: Web Admin แบบ Local

**เหตุผล:** ควบคุมได้เต็มที่, เก็บรหัสผ่านในเครื่องได้ปลอดภัยกว่า

```
┌─────────────────────────────────────────────────────────┐
│  AUTO-POST Admin (localhost:3000)                        │
├─────────────────────────────────────────────────────────┤
│  [Users] [Groups] [Jobs] [Assignments] [Run Bot]         │
│                                                          │
│  Users                          │  + Add User            │
│  ┌──────┬──────────┬─────────┐  │  ┌──────────────────┐  │
│  │ ID   │ Name     │ Poster  │  │  │ Name: [_______]  │  │
│  ├──────┼──────────┼─────────┤  │  │ Email: [______]  │  │
│  │ u1   │ User 1   │ หางาน.. │  │  │ Password: [____] │  │
│  │ u2   │ User 2   │ คุณเล็ก │  │  │ [Save]           │  │
│  └──────┴──────────┴─────────┘  │  └──────────────────┘  │
└─────────────────────────────────────────────────────────┘

Data: data/auto-post.db (SQLite) หรือ data/config.json
```

**Tech:** Express + HTML/JS ง่ายๆ หรือ React, SQLite

---

### ตัวเลือก C: Config เดียวแบบ Dynamic (ไม่มี UI)

**เหตุผล:** ทำเร็ว, ไม่ต้องมี UI, แต่ User ยังต้องแก้ไฟล์

```json
// data/config.json (ไฟล์เดียว)
{
  "users": [
    { "id": "u1", "email": "...", "poster_name": "...", "sheet_url": "...", "blacklist_groups": [] }
  ],
  "groups": [
    { "id": "g1", "fb_group_id": "583362260400984", "name": "กลุ่มหางาน กทม" }
  ],
  "jobs": [
    { "id": "j1", "title": "...", "caption": "...", "owner": "...", "company": "...", "apply_link": "...", "comment_reply": "..." }
  ],
  "assignments": [
    { "job_id": "j1", "user_id": "u1", "group_ids": ["g1", "g2", "g3"] }
  ]
}
```

Bot อ่านไฟล์นี้แล้วรัน — เพิ่ม User/Group/Job = แก้ไฟล์เดียว

---

## โครงสร้างข้อมูลที่แนะนำ (Normalized)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Users     │     │  Assignments │     │    Jobs     │
├─────────────┤     ├──────────────┤     ├─────────────┤
│ id          │────▶│ user_id      │     │ id          │
│ email       │     │ job_id       │◀────│ title       │
│ poster_name │     │ group_ids[]  │     │ caption     │
│ sheet_url   │     └──────┬───────┘     │ owner       │
│ blacklist[] │            │             │ company     │
└─────────────┘            │             │ apply_link  │
                           │             │ comment_rep │
                           ▼             └─────────────┘
                    ┌─────────────┐
                    │   Groups    │
                    ├─────────────┤
                    │ id         │
                    │ fb_group_id│
                    │ name       │
                    └─────────────┘
```

**ความสัมพันธ์:**
- 1 Assignment = 1 งาน + 1 User + หลายกลุ่ม
- งานเดียวกันสามารถ assign ให้ User หลายคน + กลุ่มต่างกันได้

---

## แนะนำ: เริ่มจากตัวเลือก A (Google Sheets)

### Phase 1: ปรับ Apps Script

1. สร้าง Sheet ใหม่หรือเพิ่มแท็บ: `Users`, `Groups`, `Jobs`, `Assignments`
2. เพิ่มฟังก์ชัน `doGet(e)` หรือ `doPost(e)` สำหรับ:
   - `GET ?action=CONFIG` → คืนค่า config ทั้งหมด (สำหรับ Bot)
   - `POST ?action=...` → สำหรับ CRUD (ถ้าต้องการให้ User แก้ผ่าน API)

### Phase 2: ปรับ Bot

1. สร้าง `loadConfigFromSheet(sheetUrl)` แทน `loadMasterConfig(userId)`
2. ดึง config → แปลงเป็นรูปแบบเดิม → ส่งเข้า `postToGroup` เหมือนเดิม
3. รันแบบ: `npx playwright test postAll --headed` (รันทุก assignment)

### Phase 3: รหัสผ่าน

- **วิธี 1:** เก็บใน Sheet แยก (จำกัดสิทธิ์) หรือ Sheet ส่วนตัว
- **วิธี 2:** เก็บใน `.env` โดยใช้ `USER_1_PASSWORD=xxx` แล้ว map กับ user id
- **วิธี 3:** ใช้ Google Identity / OAuth (ซับซ้อนกว่า)

---

## สรุปขั้นตอนถ้าทำตัวเลือก A

| ลำดับ | งาน | ผู้รับผิดชอบ |
|-------|-----|--------------|
| 1 | ออกแบบ Sheet (columns) ให้ชัด | - |
| 2 | เขียน Apps Script: CONFIG API | Dev |
| 3 | Migrate ข้อมูลจาก User1-8.json → Sheet | Dev |
| 4 | ปรับ loadConfig ให้อ่านจาก Sheet | Dev |
| 5 | สร้าง test เดียว `postAll.spec.ts` ที่รันทุก assignment | Dev |
| 6 | คู่มือให้ User: วิธีเพิ่ม User/Group/Job | - |

---

## คำถามเพื่อตัดสินใจ

1. **User จะจัดการผ่านอะไร?** — แก้ Sheet โดยตรง หรือผ่านฟอร์ม/UI?
2. **รหัสผ่าน Facebook เก็บที่ไหน?** — Sheet, .env, หรือที่อื่น?
3. **ต้องการ Worker Bot (User4Worker) ในระบบ Dynamic ด้วยไหม?** — หรือแยก config ไว้เหมือนเดิม?
