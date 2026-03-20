# AUTO-POST - รายงานผลการตรวจสอบ Code ทั้งหมด

## 1. โครงสร้างโปรเจกต์

```
AUTO-POST/
├── .env, .env.example
├── package.json, playwright.config.ts, tsconfig.json
├── config/          # ตัวอย่าง config
├── data/            # ใช้เมื่อไม่มี DATABASE_URL (users, groups, jobs, assignments)
├── database/        # schema.sql
├── docs/
├── public/          # Web Admin (index.html, app.js)
├── scripts/         # migrate, migrate:user-groups, add-credentials, remove-duplicate-4worker
├── server/          # Express API + db.js
├── src/
│   ├── helpers/     # loadConfig, facebookLogin, postToGroup, postToGroupWorker, saveToSheet
│   └── types/
└── tests/           # postAll (โพสต์), user1-3comment, user4commentWorker (คอมเมนต์)
```

---

## 2. Data Flow

```
Web Admin (CRUD) → Express API → PostgreSQL
                              ↓
                    POST /api/run/post → spawn Playwright
                              ↓
                    postAll.spec.ts → loadDynamicConfig
                              ↓
                    facebookLogin → postToGroup (แต่ละ assignment)
```

---

## 3. Config Sources (ลำดับความสำคัญ)

| เงื่อนไข | แหล่งข้อมูล |
|----------|-------------|
| **DATABASE_URL มีค่า** | PostgreSQL (users, groups, jobs, assignments) |
| **ไม่มี DATABASE_URL** | data/*.json (users, groups, jobs, assignments) |

---

## 4. สิ่งที่แก้ไขแล้ว

### 4.1 Playwright Project Name
- **ปัญหา:** Server ใช้ `--project=chromium` แต่ config กำหนด `name: 'Google Chrome'`
- **แก้:** เปลี่ยนเป็น `--project=Google Chrome`

### 4.2 postToGroupWorker
- **ปัญหา:** fbName hardcoded เป็น `'User 4'`
- **แก้:** รับ `posterName` จาก config (poster_name ของ User ใน DB)

### 4.3 saveToSheet
- **ปัญหา:** Silent fail เมื่อ POST ไป Sheet ไม่สำเร็จ
- **แก้:** เพิ่ม `console.error` เพื่อ log error

### 4.4 getUsers ORDER BY
- **ปัญหา:** ORDER BY env_key อาจเรียง User ใหม่แปลก
- **แก้:** ORDER BY name (เมื่อมี) หรือ env_key

### 4.5 datachonburi.jason
- **ปัญหา:** ไฟล์ typo (.jason), เนื้อหาว่าง
- **แก้:** ลบไฟล์ (ไม่ได้ใช้งาน)

---

## 5. ข้อควรระวัง / ปรับปรุงในอนาคต

### 5.1 ความปลอดภัย
- **ไม่มี Authentication** – API ทุก endpoint เปิดให้ทุกคน
- **Credentials ใน DB** – ไม่มีการเข้ารหัส (encrypt at rest)
- **แนะนำ:** เพิ่ม Basic Auth หรือ API key สำหรับ production

### 5.2 loadMasterConfig / loadWorkerConfig
- **หา User โดย env_key** – comment specs ใช้ env_key = "1", "2", "3", "4"
- **postAll** ใช้ loadDynamicConfig (User+Job+Groups จาก User.group_ids)

### 5.3 API Run Post
- **รันได้ 1 ครั้งเดียว** – ถ้ากดซ้ำจะได้ 409
- **ต้องรัน Web บนเครื่องเดียวกับที่ต้องการให้ Browser เปิด**


---

## 6. การทำงานของ Tests

| Test | Config | หน้าที่ |
|------|--------|---------|
| **postAll** | loadDynamicConfig | โพสต์ตาม Assignments ทั้งหมด (User+Job, Groups จาก User) |
| **user1comment, user2comment** | loadMasterConfig(1/2) | ดึงงานจาก Sheet, bump, ตอบ, สกัดเบอร์ |
| **user3comment** | loadMasterConfig(3) | เพิ่มลิงก์สมัครในคอมเมนต์โพสต์ตัวเอง |
| **user4commentWorker** | loadWorkerConfig | ตรวจคอมเมนต์และส่งเบอร์ไป Sheet |

---

## 7. Database Schema

- **users:** id, env_key, name, poster_name, sheet_url, email, password, group_ids (JSONB), blacklist_groups, post_settings
- **groups:** id, name, fb_group_id, province
- **jobs:** id, title, owner, company, caption, apply_link, comment_reply, job_type, status
- **templates:** id, name, title, owner, company, caption, apply_link, comment_reply
- **assignments:** id, job_id, user_id (Groups มาจาก User.group_ids)

---

## 8. สรุป

- โครงสร้างหลักถูกต้องและใช้งานได้
- แก้ไขครบตามรายการในหัวข้อ 4
- ควรเพิ่ม Authentication และการเข้ารหัส credentials สำหรับ production
