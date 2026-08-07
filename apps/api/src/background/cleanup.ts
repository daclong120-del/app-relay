import fs from 'fs';
import path from 'path';
import { supabase } from '../database/supabase.js';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(process.cwd(), 'artifacts');

export async function cleanupExpiredArtifacts() {
  try {
    const now = new Date().toISOString();
    const { data: expiredArtifacts, error } = await supabase
      .from('artifacts')
      .select('*')
      .eq('state', 'available')
      .lt('expires_at', now);

    if (error) {
      console.warn(`[Cleanup] Failed to query expired artifacts: ${error.message}`);
      return;
    }

    if (!expiredArtifacts || expiredArtifacts.length === 0) {
      return;
    }

    console.log(`[Cleanup] Found ${expiredArtifacts.length} expired artifacts. Cleaning up...`);

    for (const artifact of expiredArtifacts) {
      if (artifact.locator) {
        const filePath = path.join(ARTIFACT_DIR, artifact.locator);
        const fileDir = path.dirname(filePath);

        try {
          if (fs.existsSync(filePath)) {
            await fs.promises.rm(filePath, { force: true });
          }
          if (fs.existsSync(fileDir)) {
            await fs.promises.rmdir(fileDir).catch(() => {});
          }
        } catch (fileErr) {
          console.warn(`[Cleanup] Error deleting file ${filePath}: ${fileErr}`);
        }
      }

      await supabase
        .from('artifacts')
        .update({ state: 'expired', updated_at: new Date().toISOString() })
        .eq('id', artifact.id);

      console.log(`[Cleanup] Artifact ${artifact.id} marked as expired.`);
    }
  } catch (err: any) {
    console.error(`[Cleanup] Background task error: ${err.message}`);
  }
}

export function startArtifactCleanupCron(intervalMs = 3600000) {
  // Run once on startup after 10s
  setTimeout(() => cleanupExpiredArtifacts(), 10000);

  // Run on interval (default every 1 hour)
  setInterval(() => cleanupExpiredArtifacts(), intervalMs);
}
