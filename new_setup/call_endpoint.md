Để gọi endpoint của server chỉ cần 2 thứ:

1. **BASE URL**

```env
BASE_URL=https://api.example.com/v1
```

2. **API Token**

```env
API_TOKEN=apr_live_xxxxxxxxx
```

Ví dụ:

```bash
curl "$BASE_URL/jobs" \
  -H "Authorization: Bearer $API_TOKEN"
```

## Lấy kết quả

Job chạy bất đồng bộ nên không có chuyện một request là có file ngay. Bốn bước:

```bash
# 1. Đặt hàng
JOB=$(curl -s -X POST "$BASE_URL/jobs" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"playUrl":"https://play.google.com/store/apps/details?id=com.zing.zalo"}' \
  | jq -r .data.jobId)

# 2. Chờ xong
until [ "$(curl -s "$BASE_URL/jobs/$JOB" \
  -H "Authorization: Bearer $API_TOKEN" | jq -r .data.status)" = "completed" ]
do sleep 5; done

# 3. Xin link — thêm select nếu chỉ cần một phần
URL=$(curl -s -X POST "$BASE_URL/jobs/$JOB/artifact/download-url" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"select":"screenshots"}' | jq -r .data.downloadUrl)

# 4. Tải — link đã ký nên không cần token nữa
curl -O -J "$URL"
```

Không truyền `select` thì nhận cả cục như trước.

Xem có những gì trước khi tải:

```bash
curl "$BASE_URL/jobs/$JOB/artifact/files" \
  -H "Authorization: Bearer $API_TOKEN"
```

Đừng tải cả cục nếu chỉ cần metadata: với Zalo, `select=listing` là 24 KB còn `all` là 73 MB.

Danh sách `select` nằm trong `api-endpoint.md`. Cách lưu trữ và thời hạn nằm trong `artifact_storage.md`.

Người gọi không cần biết:

* Supabase URL hoặc secret key.
* Địa chỉ worker.
* Android SDK/JDK.
* VPS IP nếu đã có domain.
* Cloudflare Tunnel hay Caddy đứng trước API.
* Tài khoản Google Play.

## Điều nên nói với đối tác

**Job chạy tuần tự trên một emulator**, mỗi job khoảng 60 giây. Gửi 20 URL là mất khoảng 20 phút, và nếu có bên khác đang gửi thì phải xếp hàng sau. Đừng thiết kế client theo kiểu gọi xong chờ ngay.

**Đừng tải cả cục nếu không cần APK.** Chênh lệch rất lớn:

| Cần gì | `select` | Zalo |
| --- | --- | --- |
| metadata | `listing` | 24 KB |
| ảnh listing | `screenshots` | 1.2 MB |
| APK chính | `apk.base` | 68.6 MB |
| tất cả | bỏ trống | 73 MB |

**Link tải sống 10 phút**, hết hạn thì gọi lại `download-url`, file vẫn còn. **APK chỉ được giữ 6 tiếng** sau khi job xong; quá hạn thì phần nhẹ vẫn tra được nhưng muốn APK phải chạy job mới.

**Tải file lớn nên dùng `Range`** để resume khi đứt mạng, thay vì tải lại 68 MB từ đầu.

Chỉ cần nhận:

```text
URL: https://api.example.com/v1
KEY: apr_live_xxxxxxxxx
```

Riêng worker cũng dùng đúng mô hình hai giá trị, nhưng là thông tin nội bộ:

```text
URL: http://api:3000/internal/v1
KEY: worker_live_xxxxxxxxx
```
