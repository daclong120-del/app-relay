Edited vercel-review.md
Viewed vercel-review-branch.md:1-26

Trong thực tế ngành phần mềm, quy trình làm việc chuẩn của một Developer qua các giai đoạn được chia làm **3 đến 4 môi trường độc lập** như sau:

---

### 1. 💻 Giai đoạn 1: Local Dev (Chỉ một mình Dev thấy)
* **Người dùng**: Chỉ có mình bạn (Dev) thao tác trên máy cá nhân.
* **Cách làm**: Chạy web ở máy local bằng lệnh `npm run dev` $\rightarrow$ truy cập `http://localhost:3000`.
* **Mục đích**: Thử nghiệm code, sửa lỗi nhanh, viết giao diện nháp.
* **Database**: Dùng Supabase Local hoặc Database dev phụ.
* **Đặc điểm**: Sửa code là giao diện đổi ngay lập tức, không ai khác truy cập được.

---

### 2. 🧪 Giai đoạn 2: Private Preview / Dev Sandbox (Dev tự test trên Server)
* **Người dùng**: Vẫn chỉ có Dev.
* **Cách làm**: Chạy `npx vercel` để sinh ra **1 link Preview ngẫu nhiên**.
* **Mục đích**: Dev tự kiểm tra xem code của mình khi đóng gói thật trên Serverless (Vercel) có bị lỗi build, lỗi SSR, hay lỗi biến môi trường (.env) không.
* **Đặc điểm**: Giúp Dev tự phát hiện lỗi môi trường trước khi gửi cho người khác xem.

---

### 3. 👥 Giai đoạn 3: Review / Staging (Đồng nghiệp, QA, Sếp test)
* **Người dùng**: Đồng nghiệp, Tester/QA, Sếp, Khách hàng duyệt tính năng.
* **Cách làm**: Đẩy code lên **Tên miền Review cố định** (`app-relay-review.vercel.app`) hoặc nhánh `staging`.
* **Mục đích**: Đội nhóm cùng truy cập 1 đường link cố định để nghiệm thu tính năng mới.
* **Database**: Dùng Database Staging/Test (để dữ liệu bấm thử không bị lẫn vào DB thật).

---

### 4. 🚀 Giai đoạn 4: Production (Người dùng thật)
* **Người dùng**: Khách hàng thật của công ty.
* **Cách làm**: Merge code vào `main` hoặc `npx vercel --prod` $\rightarrow$ chạy trên tên miền chính (`creative.lutech.vn`).
* **Database**: Database Production thật.

---

### 💡 Tóm tắt luồng chuẩn của Dev:
```text
Local (localhost:3000) ➔ Dev tự test (Link Preview ngẫu nhiên) ➔ Review/Staging (Link cố định cho team test) ➔ Production (Web thật)
```