# คู่มือตั้งค่า Dynamic Mode (Web Admin)

## 1. ติดตั้งและรัน Web Admin

```bash
npm install
cp .env.example .env
# ถ้ามี DB อยู่แล้ว รัน migration ก่อน
npm run migrate:user-groups   # ย้าย Groups จาก Assignment ไป User
npm run migrate:fb-token      # เพิ่ม fb_access_token ใน users
npm run start
```

เปิด http://localhost:3000

## 2. ตั้งค่า .env

แก้ไข `.env`:

```
PORT=3000

# ใช้ env_key จาก User ที่สร้างใน Web Admin
USER_1_EMAIL=your_facebook_email_or_phone
USER_1_PASSWORD=your_facebook_password

USER_2_EMAIL=...
USER_2_PASSWORD=...
```

## 3. สร้างข้อมูลใน Web Admin

### Users
- **ชื่อ**: ชื่อแสดง
- **Email, Password**: credentials (หรือใช้ .env ตาม env_key)
- **Groups**: ผูกกลุ่ม Facebook ที่ User นี้โพสต์ได้ (เลือกหลายกลุ่ม)
- **Poster Name**: ชื่อที่แสดงในโพสต์
- **Sheet URL**: Google Apps Script Web App URL
- **Blacklist Groups**: Group ID ที่ไม่ใส่ apply link (คั่นด้วย comma)
- **FB Access Token**: สำหรับดึงชื่อกลุ่มจาก Facebook (หรือใช้ .env: USER_{env_key}_FB_ACCESS_TOKEN)

### Groups
- **ชื่อกลุ่ม**: ชื่อแสดง
- **Facebook Group ID**: ID จาก URL กลุ่ม (เช่น `583362260400984`)
- **จังหวัด**: (ถ้ามี)

### Jobs
- **หัวข้อ, Owner, Company, Caption, Apply Link, Comment Reply**
- ปุ่ม **บันทึกเป็น Template** สำหรับใช้ซ้ำ

### Templates
- สร้างจาก Job หรือเพิ่มใหม่
- ปุ่ม **สร้าง Job จาก Template** เพื่อคัดลอกเป็น Job ใหม่

### Assignments
- **User**: เลือกบัญชี Facebook
- **Job**: เลือกงานที่จะโพสต์
- Groups มาจาก User ที่ผูกไว้ในหน้า Users

## 4. รัน Bot โพสต์

```bash
npm run test:postAll
```

หรือ

```bash
npx playwright test postAll --headed --project=GoogleChrome
```

Bot จะอ่านจาก `data/*.json` + `.env` แล้วโพสต์ตาม Assignments
