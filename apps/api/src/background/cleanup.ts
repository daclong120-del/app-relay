import { supabase } from '../database/supabase.js';
import {
  deleteApkFiles,
  deleteArtifactDir,
  freeBytes,
  listArtifactDirs,
  minFreeBytes,
} from '../utils/artifact-store.js';

function graceMs(): number {
  const minutes = parseInt(process.env.DELETE_AFTER_DOWNLOAD_GRACE_MINUTES || '10', 10);
  return minutes * 60 * 1000;
}

/**
 * Xoá APK sau khi client đã tải xong trọn vẹn, nếu job bật `deleteAfterDownload`.
 *
 * Có thời gian ân hạn để client còn cửa tải lại nếu ghi file hỏng. Phần nhẹ
 * (listing, screenshots, manifest) luôn được giữ theo ARTIFACT_TTL_HOURS.
 */
export async function scheduleDeleteAfterDownload(jobId: string): Promise<void> {
  const { data: job } = await supabase
    .from('jobs')
    .select('delete_after_download')
    .eq('id', jobId)
    .maybeSingle();

  if (!job?.delete_after_download) return;

  setTimeout(() => {
    void expireApk(jobId, 'deleteAfterDownload');
  }, graceMs()).unref();
}

/** Xoá phần APK của một artifact, giữ phần nhẹ, chuyển state sang 'partial'. */
async function expireApk(jobId: string, reason: string): Promise<void> {
  try {
    const freed = await deleteApkFiles(jobId);

    const { data: artifact } = await supabase
      .from('artifacts')
      .select('files, size_bytes')
      .eq('job_id', jobId)
      .maybeSingle();

    const remaining = ((artifact?.files as any[]) || []).filter(
      (f) => f.path !== 'base.apk' && !/^split_config\..+\.apk$/.test(f.path)
    );

    await supabase
      .from('artifacts')
      .update({
        state: 'partial',
        files: remaining,
        size_bytes: remaining.reduce((s: number, f: any) => s + (f.sizeBytes || 0), 0),
        apk_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', jobId);

    if (freed > 0) {
      console.log(`[Cleanup] Xoá APK của ${jobId} (${reason}), giải phóng ${(freed / 1048576).toFixed(1)} MB.`);
    }
  } catch (err: any) {
    console.warn(`[Cleanup] Lỗi khi xoá APK của ${jobId}: ${err.message}`);
  }
}

/** APK hết hạn sớm — chiếm ~98% dung lượng nên đi trước phần còn lại. */
export async function cleanupExpiredApks(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('artifacts')
      .select('job_id')
      .eq('state', 'available')
      .not('apk_expires_at', 'is', null)
      .lt('apk_expires_at', new Date().toISOString());

    if (error) {
      console.warn(`[Cleanup] Không truy vấn được APK hết hạn: ${error.message}`);
      return;
    }

    for (const row of data || []) {
      await expireApk(row.job_id, 'APK_TTL_HOURS');
    }
  } catch (err: any) {
    console.error(`[Cleanup] Lỗi quét APK hết hạn: ${err.message}`);
  }
}

/** Cả thư mục hết hạn — xoá sạch, state = expired. */
export async function cleanupExpiredArtifacts(): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { data: expired, error } = await supabase
      .from('artifacts')
      .select('id, job_id')
      .in('state', ['available', 'partial'])
      .lt('expires_at', now);

    if (error) {
      console.warn(`[Cleanup] Không truy vấn được artifact hết hạn: ${error.message}`);
      return;
    }

    if (!expired || expired.length === 0) return;

    console.log(`[Cleanup] ${expired.length} artifact hết hạn, đang dọn...`);

    for (const artifact of expired) {
      await deleteArtifactDir(artifact.job_id);
      await supabase
        .from('artifacts')
        .update({ state: 'expired', files: [], size_bytes: 0, updated_at: new Date().toISOString() })
        .eq('id', artifact.id);
      console.log(`[Cleanup] Artifact ${artifact.id} → expired.`);
    }
  } catch (err: any) {
    console.error(`[Cleanup] Lỗi tác vụ nền: ${err.message}`);
  }
}

/**
 * Đuổi theo áp lực đĩa, không đợi hết hạn.
 *
 * TTL một mình không đủ khi job dồn về nhanh hơn tốc độ hết hạn. Xoá APK cũ
 * nhất trước vì đó là 98% dung lượng, và giữ lại phần nhẹ để client vẫn tra
 * được metadata.
 */
export async function evictUnderDiskPressure(): Promise<void> {
  try {
    if ((await freeBytes()) >= minFreeBytes()) return;

    const { data: candidates } = await supabase
      .from('artifacts')
      .select('job_id')
      .eq('state', 'available')
      .order('created_at', { ascending: true })
      .limit(50);

    if (candidates && candidates.length > 0) {
      console.warn(`[Cleanup] Đĩa dưới ngưỡng — đuổi APK của tối đa ${candidates.length} artifact cũ nhất.`);

      for (const row of candidates) {
        await expireApk(row.job_id, 'áp lực đĩa');
        if ((await freeBytes()) >= minFreeBytes()) {
          console.log('[Cleanup] Đĩa đã về trên ngưỡng, dừng đuổi.');
          return;
        }
      }
    }

    // Nước cuối: mọi artifact đã 'partial' mà đĩa vẫn thấp. Không xoá tiếp thì
    // claim bị chặn vĩnh viễn và hệ thống đứng im — mất phần nhẹ của artifact
    // cũ nhất vẫn hơn là không nhận job nào nữa.
    const { data: partials } = await supabase
      .from('artifacts')
      .select('id, job_id')
      .eq('state', 'partial')
      .order('created_at', { ascending: true })
      .limit(50);

    if (!partials || partials.length === 0) {
      console.error('[Cleanup] Đĩa thấp nhưng không còn artifact nào để đuổi — cần can thiệp thủ công.');
      return;
    }

    console.error(`[Cleanup] Đĩa vẫn thấp sau khi xoá hết APK — xoá hẳn artifact cũ nhất để không kẹt claim.`);

    for (const row of partials) {
      await deleteArtifactDir(row.job_id);
      await supabase
        .from('artifacts')
        .update({ state: 'expired', files: [], size_bytes: 0, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      console.warn(`[Cleanup] Artifact ${row.id} bị xoá hẳn do áp lực đĩa.`);

      if ((await freeBytes()) >= minFreeBytes()) {
        console.log('[Cleanup] Đĩa đã về trên ngưỡng, dừng đuổi.');
        return;
      }
    }
  } catch (err: any) {
    console.error(`[Cleanup] Lỗi khi đuổi theo áp lực đĩa: ${err.message}`);
  }
}

/**
 * Xoá thư mục artifact không còn dòng nào trong DB.
 *
 * `PUT files/*` ghi xuống đĩa nhưng chỉ `finalize` mới tạo dòng `artifacts`.
 * Job bị huỷ hoặc chết giữa lúc upload để lại thư mục vô chủ, mà mọi tác vụ
 * dọn khác đều quét theo DB nên không bao giờ thấy nó. Không có hàm này thì
 * mỗi lần job hỏng giữa chừng là mất vĩnh viễn tới hàng trăm MB.
 *
 * Chỉ đụng vào thư mục đã "nguội" — upload đang chạy có file được ghi liên tục
 * nên mtime luôn mới.
 */
export async function cleanupOrphanDirs(): Promise<void> {
  try {
    const minAgeMs = parseInt(process.env.ORPHAN_DIR_MIN_AGE_MINUTES || '120', 10) * 60 * 1000;
    const dirs = await listArtifactDirs();
    if (dirs.length === 0) return;

    const { data: rows, error } = await supabase
      .from('artifacts')
      .select('job_id')
      .in('job_id', dirs.map((d) => d.jobId));

    if (error) {
      // Không đọc được DB thì tuyệt đối không xoá: mọi thư mục sẽ trông như
      // mồ côi và ta sẽ xoá sạch artifact hợp lệ.
      console.warn(`[Cleanup] Bỏ qua dò mồ côi, không truy vấn được DB: ${error.message}`);
      return;
    }

    const known = new Set((rows || []).map((r) => r.job_id));
    const now = Date.now();

    for (const dir of dirs) {
      if (known.has(dir.jobId)) continue;
      if (now - dir.mtimeMs < minAgeMs) continue;

      await deleteArtifactDir(dir.jobId);
      console.warn(
        `[Cleanup] Xoá thư mục mồ côi ${dir.jobId} (không có trong DB), ` +
          `giải phóng ${(dir.sizeBytes / 1048576).toFixed(1)} MB.`
      );
    }
  } catch (err: any) {
    console.error(`[Cleanup] Lỗi khi dò thư mục mồ côi: ${err.message}`);
  }
}

async function runAll(): Promise<void> {
  await cleanupExpiredApks();
  await cleanupExpiredArtifacts();
  await cleanupOrphanDirs();
  await evictUnderDiskPressure();
}

export function startArtifactCleanupCron(intervalMs = 3600000) {
  setTimeout(() => void runAll(), 10000).unref();
  setInterval(() => void runAll(), intervalMs).unref();
}
