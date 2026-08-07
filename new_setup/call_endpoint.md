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

Người gọi không cần biết:

* Supabase URL hoặc secret key.
* Địa chỉ worker.
* Android SDK/JDK.
* VPS IP nếu đã có domain.
* Tài khoản Google Play.

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
