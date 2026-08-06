// Safe Device & Workspace Cleanup Manager (Preserves Pre-existing Apps)

import { promises as fs } from 'fs';
import { join } from 'path';
import { AdbClient } from '../android/adb-client';

export interface DeviceCleanupOptions {
  serial: string;
  packageId: string;
  wasInstalledBefore: boolean;
  jobInstalledApp: boolean;
  adbClient?: AdbClient;
}

export async function safeDeviceCleanup(options: DeviceCleanupOptions): Promise<{ uninstalled: boolean; reason: string }> {
  if (options.wasInstalledBefore) {
    return {
      uninstalled: false,
      reason: `Package "${options.packageId}" was installed prior to job execution. Preserving existing app per safety contract.`,
    };
  }

  if (!options.jobInstalledApp) {
    return {
      uninstalled: false,
      reason: `Job did not perform app installation. Skipping uninstall.`,
    };
  }

  if (options.adbClient) {
    try {
      const success = await options.adbClient.uninstallPackage(options.serial, options.packageId);
      return {
        uninstalled: success,
        reason: success ? `Uninstalled package "${options.packageId}" from device ${options.serial}.` : `Uninstall returned failure.`,
      };
    } catch (err: any) {
      return {
        uninstalled: false,
        reason: `Failed to uninstall package "${options.packageId}": ${err.message}`,
      };
    }
  }

  return {
    uninstalled: false,
    reason: `ADB client unavailable for device cleanup.`,
  };
}

export async function safeWorkspaceCleanup(workspaceDir: string): Promise<boolean> {
  try {
    await fs.rm(workspaceDir, { recursive: true, force: true });
    return true;
  } catch (err: any) {
    console.warn(`[Cleanup] Workspace cleanup failed for ${workspaceDir}: ${err.message}`);
    return false;
  }
}

export async function reconcileStaleWorkspaces(baseWorkDir: string, maxAgeHours = 24): Promise<number> {
  let cleanedCount = 0;
  try {
    const entries = await fs.readdir(baseWorkDir, { withFileTypes: true });
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 3600 * 1000;

    for (const entry of entries) {
      const fullPath = join(baseWorkDir, entry.name);
      if (entry.name.endsWith('.partial')) {
        await fs.rm(fullPath, { force: true });
        cleanedCount++;
        continue;
      }

      if (entry.isDirectory()) {
        const stat = await fs.stat(fullPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          await fs.rm(fullPath, { recursive: true, force: true });
          cleanedCount++;
        }
      }
    }
  } catch {
    // Directory may not exist yet
  }
  return cleanedCount;
}
