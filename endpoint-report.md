# Endpoint report

- Thời điểm: 2026-08-11T06:52:04.878Z
- BASE_URL: https://recovered-ambien-knights-seats.trycloudflare.com/v1
- Chế độ: có tạo job · internal=safe
- Job dùng cho artifact: (không có)
- Kết quả: **0 pass · 1 fail · 43 skip** / 44

> Dừng sớm: không kết nối được: ENOTFOUND

| | Nhóm | Route | Kiểm tra | Mong đợi | Thực tế | ms | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ✘ | System | `GET /health` | /health không cần token | 200 | ERR | 75 | không kết nối được: ENOTFOUND |
| − | System | `GET /system/status` | database + hàng đợi + worker | 200 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Auth | `GET /jobs` | thiếu Authorization → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Auth | `GET /jobs` | token sai → 403 | 403 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Auth | `GET /jobs` | sai scheme (Basic) → 401 | 401/403 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Apps | `GET /apps?page=1&pageSize=5` | danh sách app, có phân trang | 200 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Apps | `GET /apps?search=face` | lọc theo search | 200 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Apps | `GET /apps/com.khong.ton.tai.test` | chi tiết một app | 200 | — |  | chưa có app nào trong hệ thống |
| − | Apps | `GET /apps/com.khong.ton.tai.test` | package lạ → 404 | 404 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `GET /jobs?page=1&pageSize=10` | danh sách job | 200 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `GET /jobs?status=completed&pageSize=5` | lọc theo status | 200 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `GET /jobs?status=khong_ton_tai` | status không hợp lệ → 400 | 400/200 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `GET /jobs/job_0000000000_khongtontai` | job lạ → 404 | 404 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `POST /jobs` | tạo job | 201 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `POST /jobs` | gửi lại cùng Idempotency-Key → 200 | 200 | — |  | không tạo được job ở bước trước |
| − | Jobs | `POST /jobs` | body thiếu playUrl → 400 | 400 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `POST /jobs` | URL thiếu ?id= → 400 | 400 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `POST /jobs/batch` | tạo batch 2 job | 200/201 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Jobs | `GET /jobs?batchId=` | lọc theo batchId | 200 | — |  | không tạo được batch |
| − | Jobs | `GET /jobs/job_0000000000_khongtontai` | chi tiết job | 200 | — |  | không có job nào để đọc |
| − | Jobs | `GET /jobs/job_0000000000_khongtontai/events` | timeline job | 200 | — |  | không có job nào để đọc |
| − | Artifact | `GET /jobs/job_0000000000_khongtontai/artifact/files` | liệt kê file trong artifact | 200 | — |  | chưa có job completed nào để lấy artifact |
| − | Artifact | `GET /jobs/job_0000000000_khongtontai/artifact/files` | job lạ → 404 | 404 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Artifact | `POST /jobs/job_0000000000_khongtontai/artifact/download-url` | download-url không body = cả cục | 200 | — |  | chưa có job completed nào để lấy artifact |
| − | Artifact | `POST /jobs/job_0000000000_khongtontai/artifact/download-url` | download-url select=metadata | 200 | — |  | chưa có job completed nào để lấy artifact |
| − | Artifact | `POST /jobs/job_0000000000_khongtontai/artifact/download-url` | select lạ → 400 | 400 | — |  | chưa có job completed nào để lấy artifact |
| − | Artifact | `POST /jobs/job_0000000000_khongtontai/artifact/download-url` | gửi cả select lẫn path → 400 | 400 | — |  | chưa có job completed nào để lấy artifact |
| − | Artifact | `POST /jobs/job_0000000000_khongtontai/artifact/download-url` | path không tồn tại → 404 | 404/400 | — |  | chưa có job completed nào để lấy artifact |
| − | Artifact | `POST /jobs/job_0000000000_khongtontai/artifact/download-url` | download-url cho đúng một file | 200 | — |  | chưa có job completed nào để lấy artifact |
| − | Download | `GET (signed url)` | link đã ký tải được mà không cần token | 200 | — |  | không xin được download URL |
| − | Download | `GET (signed url)` | hỗ trợ Range → 206 | 206 | — |  | cần link một file lớn hơn 100 byte |
| − | Download | `GET (signed url)` | Range vượt kích thước → 416 | 416 | — |  | cần link một file để tính offset |
| − | Download | `GET (signed url)` | chữ ký bị sửa → 403 | 403 | — |  | không xin được download URL |
| − | Download | `GET (signed url)` | link đã hết hạn → 403 | 403 | — |  | không xin được download URL |
| − | Internal | `POST /workers/heartbeat` | worker heartbeat — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `POST /jobs/claim` | claim job — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `POST /jobs/job_0000000000_khongtontai/heartbeat` | job heartbeat — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `POST /jobs/job_0000000000_khongtontai/events` | ghi event — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `PUT /jobs/job_0000000000_khongtontai/files/base.apk` | upload file — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `POST /jobs/job_0000000000_khongtontai/artifact/finalize` | finalize artifact — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `POST /jobs/job_0000000000_khongtontai/complete` | complete job — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `POST /jobs/job_0000000000_khongtontai/fail` | fail job — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `POST /jobs/job_0000000000_khongtontai/cancelled` | cancelled job — thiếu token → 401 | 401 | — |  | hạ tầng: không kết nối được: ENOTFOUND |
| − | Internal | `(internal)` | kiểm tra có token | — | — |  | chạy với --internal=full nếu muốn |
