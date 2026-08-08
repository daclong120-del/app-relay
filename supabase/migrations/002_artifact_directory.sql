-- Artifact được lưu dưới dạng thư mục thay vì một file ZIP.
--
-- Lý do: worker đã dựng sẵn work/apks/<packageId>/ đúng layout trước khi nén.
-- Lưu lại bản nén rồi mỗi lần client xin một file lại phải giải nén ngược là
-- làm hai lần cùng một việc. Bỏ khâu nén ở giữa thì lấy một file chỉ còn là
-- đọc file khỏi đĩa, và xoá riêng APK (98% dung lượng) chỉ là một lệnh rm.
--
-- Xem new_setup/artifact_storage.md.

-- ── jobs ──────────────────────────────────────────────────────────────
alter table public.jobs
  add column if not exists delete_after_download boolean not null default false;

-- ── artifacts ─────────────────────────────────────────────────────────

-- Danh sách file: [{path, sizeBytes, sha256, contentType}]
alter table public.artifacts
  add column if not exists files jsonb not null default '[]'::jsonb;

-- APK hết hạn sớm hơn phần còn lại vì nó chiếm 98% dung lượng.
alter table public.artifacts
  add column if not exists apk_expires_at timestamptz;

-- 'partial' = APK đã bị xoá theo TTL riêng, phần nhẹ vẫn tải được.
alter table public.artifacts
  drop constraint if exists artifacts_state_check;

alter table public.artifacts
  add constraint artifacts_state_check
  check (state in ('preparing', 'available', 'partial', 'expired', 'deleted'));

alter table public.artifacts
  alter column kind set default 'bundle_dir';

-- sha256 cấp bundle không còn ý nghĩa: ZIP sinh khi đang stream nên mỗi lần
-- một khác. Tính toàn vẹn kiểm theo từng file trong `files`. Giữ cột lại để
-- artifact cũ (bundle_zip) vẫn đọc được.
comment on column public.artifacts.sha256 is
  'Chỉ dùng cho artifact kind=bundle_zip cũ. Với bundle_dir, dùng files[].sha256.';

comment on column public.artifacts.files is
  'Danh sách file trong thư mục artifact: [{path, sizeBytes, sha256, contentType}].';

-- Cleanup quét theo hai mốc hết hạn nên cần index riêng cho mốc APK.
create index if not exists artifacts_apk_expiry_idx
  on public.artifacts(apk_expires_at)
  where state = 'available' and apk_expires_at is not null;

create index if not exists artifacts_expiry_idx
  on public.artifacts(expires_at)
  where state in ('available', 'partial');
