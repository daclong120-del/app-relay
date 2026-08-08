# Lưu trữ và giao artifact

Chốt nguyên tắc:

* API lưu artifact dưới dạng **thư mục**, đúng layout `README.md`.
* Không lưu file ZIP nào trên đĩa.
* ZIP chỉ sinh **khi đang stream** cho client, và chỉ khi client xin nhiều file.
* Client lấy được cả cục, một nhóm, hoặc đúng một file.
* APK và phần metadata có **thời hạn sống khác nhau**.
* Không dùng dịch vụ lưu trữ bên thứ ba.

## 1. Vì sao không lưu ZIP

Worker đã dựng sẵn `work/apks/<packageId>/` đúng chuẩn trước khi làm bất cứ việc gì khác. Nén chỉ là bước đóng gói cuối để vận chuyển.

Nếu API lưu lại file ZIP đó thì mỗi lần client xin một tấm ảnh, server phải đọc *central directory*, tìm entry, giải nén — làm lại đúng việc worker vừa làm ngược. Bỏ khâu nén ở giữa thì lấy một file chỉ còn là đọc file khỏi đĩa.

Đo trên `com.zing.zalo`:

| Nhóm                                    | Thô      | Trong ZIP | % bundle |
| --------------------------------------- | -------- | --------- | -------- |
| `base.apk` + 2 split                    | 146.7 MB | 68.5 MB   | 98.2%    |
| `playstore/screenshots/` (6 ảnh)        | 1.24 MB  | 1.05 MB   | 1.5%     |
| `page.html`                             | 1.19 MB  | 204 KB    | 0.3%     |
| `icon.png` + `description.md` + `listing.json` | 24 KB | 22 KB | 0.03%    |
| `PULL_MANIFEST` + `package-info` + `device-dir` | 80 KB | 10 KB | 0.01%   |

APK chiếm 98%. Client chỉ cần metadata mà phải tải cả cục là lãng phí khoảng 3000 lần.

## 2. Layout trên API server

```text
/data/artifacts/{jobId}/
├── base.apk
├── split_config.arm64_v8a.apk
├── split_config.xxhdpi.apk
├── PULL_MANIFEST.txt
├── package-info.txt
├── device-dir.listing
└── playstore/
    ├── description.md
    ├── listing.json
    ├── icon.png
    ├── page.html
    └── screenshots/
        └── screenshot_XX.png
```

Layout "bắt buộc" của `README.md` giờ **chính là** layout lưu trữ, không còn là thứ tạm bên trong một file nén.

## 3. Worker gửi thư mục

`packageWorkDirToZip` bị bỏ khỏi pipeline. Worker gửi từng file:

```text
PUT  /internal/v1/jobs/{jobId}/files/{đường/dẫn/tương/đối}
POST /internal/v1/jobs/{jobId}/artifact/finalize
```

18 request cho Zalo. Mỗi request stream thẳng xuống đĩa và verify SHA-256 như `PUT artifact` cũ.

Trước khi `finalize` chạy xong, artifact ở `state = preparing` và không tải được. Nhờ vậy client không bao giờ vớ phải bản dở dang.

Worker vẫn xoá `work/apks/<packageId>/` trong `finally` như cũ.

## 4. Client lấy thứ mình cần

```text
GET /v1/jobs/{jobId}/artifact/files
GET /v1/artifacts/{artifactId}/download
GET /v1/artifacts/{artifactId}/download?path=base.apk
GET /v1/artifacts/{artifactId}/download?select=screenshots
```

Chi tiết selector nằm trong `api-endpoint.md`.

Một file → stream file thô, có `Content-Length`, hỗ trợ `Range`.
Nhiều file → gói ZIP tại chỗ, không có `Content-Length`, không lưu lại gì.

Nếu selector chỉ khớp **đúng một** file thì trả file thô luôn, không bọc ZIP quanh một entry. Ví dụ `select=apk.base` trả thẳng `base.apk`.

Sổ SHA-256 nội bộ nằm trong dotfile `.uploads.jsonl` cạnh payload: API ghi thêm sau mỗi upload thành công thay vì đọc lại toàn bộ ~150MB lúc `finalize` chỉ để tính lại con số vừa tính xong. Mọi dotfile bị loại khỏi danh sách file nên nó không lọt vào ZIP giao cho client.

Ví dụ với Zalo:

| `select`      | Tải về  | So với cả cục |
| ------------- | ------- | ------------- |
| `all`         | 73 MB   | 1x            |
| `apk.base`    | 68.6 MB | 0.94x         |
| `screenshots` | 1.24 MB | **59x nhẹ hơn** |
| `listing`     | 24 KB   | **3000x nhẹ hơn** |

## 5. Chữ ký

Chữ ký phủ `artifactId` và `expires`, **không** phủ `select` hay `path`.

Không phải cắt bớt cho tiện. Link mặc định vốn đã cho toàn bộ thư mục, nên người cầm link sửa query thành `?path=base.apk` chỉ lấy được **ít hơn** thứ họ vốn đã có quyền lấy. Ký thêm không mua được gì.

## 6. Thời hạn tách đôi

Vì file nằm rời nên xoá 98% dung lượng chỉ là một lệnh `rm`, không phải viết lại file nén.

| Phần                     | Biến                  | Mặc định |
| ------------------------ | --------------------- | -------- |
| APK (`base` + `split_*`) | `APK_TTL_HOURS`       | 6        |
| Phần còn lại             | `ARTIFACT_TTL_HOURS`  | 720      |
| Link tải                 | `DOWNLOAD_URL_TTL_SECONDS` | 600 |

Hết `APK_TTL_HOURS`: xoá APK, giữ nguyên phần nhẹ. Client vẫn tra được listing, screenshots, version và **sha256 của APK đã xoá** — muốn file thì chạy job mới.

Hết `ARTIFACT_TTL_HOURS`: xoá cả thư mục, `state = expired`.

Dung lượng giữ lại mỗi job:

| Cách                          | Trong 48h  | Dài hạn        |
| ----------------------------- | ---------- | -------------- |
| Lưu ZIP nguyên cục            | 69.8 MB    | 69.8 MB        |
| Thư mục + TTL tách đôi        | 149 MB     | **1.3 MB**     |

Ngắn hạn tốn gấp 2 vì bỏ nén khi lưu. Dài hạn rẻ hơn khoảng 50 lần.

## 7. Xoá sau khi giao

Tuỳ chọn theo từng job:

```json
{
  "playUrl": "https://play.google.com/store/apps/details?id=com.zing.zalo",
  "deleteAfterDownload": true
}
```

Client tải xong APK thì xoá APK ngay, giữ phần nhẹ theo `ARTIFACT_TTL_HOURS`.

Ba điều kiện phải đủ cả, thiếu một là mất dữ liệu:

**Lượt tải phải thực sự chứa APK.** Gắn vào mọi lượt tải thành công là sai: client xin `select=listing` (22 KB) sẽ làm bay 140 MB APK mà họ chưa hề nhận. Chỉ kích hoạt khi tập file được phục vụ có `base.apk` hoặc `split_config.*`.

**Phải là `finish`, không phải `close`.** `close` phát cả khi client tụt mạng ở 95% — xoá lúc đó là mất trắng công emulator và phải chạy lại job.

**Phải là `200`, không phải `206`.** Tải dở bằng `Range` chưa phải là đã nhận đủ. Hệ quả: client tải hoàn toàn bằng `Range` sẽ không bao giờ kích hoạt xoá — cố ý chọn hướng an toàn, để TTL lo phần còn lại.

Với một file thì đối chiếu thêm số byte đã gửi bằng đúng kích thước file. Với ZIP thì không biết trước kích thước nên chỉ dựa vào response kết thúc bình thường.

Có thời gian ân hạn `DELETE_AFTER_DOWNLOAD_GRACE_MINUTES` (mặc định 10) để còn cửa tải lại nếu client ghi file hỏng.

Vì có `Range`, tải đứt giữa chừng thì resume được thay vì phải chạy lại job — đây là điều kiện để bật `deleteAfterDownload` mà không rủi ro.

## 8. Thư mục mồ côi

`PUT files/*` ghi xuống đĩa nhưng **chỉ `finalize` mới tạo dòng trong bảng `artifacts`**. Job bị huỷ hoặc chết giữa lúc upload để lại thư mục vô chủ, mà mọi tác vụ dọn khác đều quét theo DB nên không bao giờ nhìn thấy nó.

Không xử lý thì mỗi lần job hỏng giữa chừng là mất vĩnh viễn tới hàng trăm MB — đúng thứ mà cả thiết kế này sinh ra để tránh.

Cách dò: liệt kê thư mục trực tiếp trên đĩa, đối chiếu với `artifacts.job_id`, thư mục nào không có dòng nào thì xoá.

Ba chốt an toàn bắt buộc:

* Chỉ đụng vào thư mục đã "nguội" quá `ORPHAN_DIR_MIN_AGE_MINUTES` (mặc định 120). Upload đang chạy có file ghi liên tục nên luôn mới.
* Mốc thời gian phải lấy theo file **mới nhất bên trong**, không phải mtime của thư mục gốc — ghi vào thư mục con không làm đổi mtime thư mục cha, nên một upload đang dở sẽ bị coi là cũ và bị xoá mất.
* Truy vấn DB lỗi thì **không xoá gì cả**. Nếu vẫn chạy tiếp, mọi thư mục sẽ trông như mồ côi và bị xoá sạch.

## 9. Chốt quyền khi upload

`PUT files/*` chỉ nhận khi job đang `running`. Thiếu chốt này thì worker ghi đè được artifact của job đã giao xong, khiến nội dung trên đĩa lệch với `files`/`sha256` mà DB đang công bố cho client.

`finalize` đối chiếu `workerId` với `jobs.worker_id`. Nhận `workerId` rồi bỏ qua thì worker khác chốt được artifact của job không phải của mình.

## 10. Phanh đĩa

`cleanupExpiredArtifacts` chỉ xoá thứ đã hết hạn. Nó không đủ khi job dồn về nhanh hơn tốc độ hết hạn.

Thêm ba thứ:

* Dưới `ARTIFACT_MIN_FREE_BYTES` thì đuổi artifact `available` cũ nhất, không đợi hết hạn. APK đi trước, phần nhẹ giữ lại.
* `POST /internal/v1/jobs/claim` trả `204` khi đĩa dưới ngưỡng. Job nằm yên trong `queued` thay vì chết ở bước upload — tức là chết **sau khi** đã tốn hết công emulator.
* `PUT files/*` từ chối sớm nếu `Content-Length` không vừa đĩa.

## 11. Những gì cố ý không làm

* Không dùng S3/R2/Supabase Storage. Mọi thứ nằm trên đĩa API server.
* Không lưu ZIP dựng sẵn để tải nhanh hơn — vì phải lưu hai bản.
* Không ký `select`/`path` (xem §5).
* Không cho client xoá artifact thủ công; chỉ có TTL và `deleteAfterDownload`.
