// Low-Level ADB Command Client

import { promises as fs } from 'fs';
import { dirname } from 'path';
import { safeExec } from './safe-exec';

export interface AdbDeviceInfo {
  serial: string;
  state: 'device' | 'offline' | 'unauthorized' | 'unknown';
}

export interface AdbDeviceProperties {
  sdk: number;
  abi: string;
  density: number;
  locale: string;
  bootCompleted: boolean;
}

export class AdbClient {
  constructor(private adbPath = 'adb') {}

  private async execAdb(serial: string | null, args: string[], timeoutMs = 30000) {
    const fullArgs = serial ? ['-s', serial, ...args] : [...args];
    return safeExec(this.adbPath, fullArgs, { timeoutMs });
  }

  async getDevices(): PromiseAdbDeviceInfo[] {
    const res = await safeExec(this.adbPath, ['devices']);
    if (res.exitCode !== 0) {
      throw new Error(`ADB devices command failed: ${res.stderr}`);
    }

    const lines = res.stdout.split('\n');
    const devices: AdbDeviceInfo[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('List of devices')) continue;

      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const serial = parts[0];
        const stateStr = parts[1];
        let state: AdbDeviceInfo['state'] = 'unknown';
        if (stateStr === 'device') state = 'device';
        else if (stateStr === 'offline') state = 'offline';
        else if (stateStr === 'unauthorized') state = 'unauthorized';

        devices.push({ serial, state });
      }
    }

    return devices;
  }

  async getDeviceProperty(serial: string, prop: string): Promise<string> {
    const res = await this.execAdb(serial, ['shell', 'getprop', prop]);
    return res.stdout.trim();
  }

  async getDeviceProperties(serial: string): Promise<AdbDeviceProperties> {
    const [sdkStr, abi, densityStr, locale, bootStr] = await Promise.all([
      this.getDeviceProperty(serial, 'ro.build.version.sdk'),
      this.getDeviceProperty(serial, 'ro.product.cpu.abi'),
      this.getDeviceProperty(serial, 'ro.sf.lcd_density'),
      this.getDeviceProperty(serial, 'persist.sys.locale'),
      this.getDeviceProperty(serial, 'sys.boot_completed'),
    ]);

    return {
      sdk: parseInt(sdkStr, 10) || 0,
      abi: abi || 'arm64-v8a',
      density: parseInt(densityStr, 10) || 420,
      locale: locale || 'en-US',
      bootCompleted: bootStr === '1',
    };
  }

  async checkPackagePath(serial: string, packageId: string): Promise<string[]> {
    const res = await this.execAdb(serial, ['shell', 'pm', 'path', packageId]);
    if (res.exitCode !== 0 || !res.stdout.trim()) {
      return [];
    }

    return res.stdout
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('package:'))
      .map((l) => l.replace(/^package:/, '').trim());
  }

  async pullFile(serial: string, remotePath: string, localPath: string): Promise<void> {
    await fs.mkdir(dirname(localPath), { recursive: true });
    const res = await this.execAdb(serial, ['pull', remotePath, localPath], 60000);
    if (res.exitCode !== 0) {
      throw new Error(`ADB pull failed for ${remotePath}: ${res.stderr}`);
    }
  }

  async dumpUiXml(serial: string, localOutputPath: string): Promise<string> {
    const remoteTmp = '/sdcard/window_dump.xml';
    await this.execAdb(serial, ['shell', 'uiautomator', 'dump', remoteTmp]);
    await this.pullFile(serial, remoteTmp, localOutputPath);
    return fs.readFile(localOutputPath, 'utf-8');
  }

  async tapCoordinates(serial: string, x: number, y: number): Promise<void> {
    await this.execAdb(serial, ['shell', 'input', 'tap', String(Math.floor(x)), String(Math.floor(y))]);
  }

  async openMarketUrl(serial: string, packageId: string): Promise<void> {
    await this.execAdb(serial, [
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      `market://details?id=${packageId}`,
    ]);
  }

  async wakeAndUnlockScreen(serial: string): Promise<void> {
    await this.execAdb(serial, ['shell', 'input', 'keyevent', '224']); // WAKEUP
    await this.execAdb(serial, ['shell', 'input', 'keyevent', '82']);  // MENU/UNLOCK
  }

  async forceStopPackage(serial: string, packageId: string): Promise<void> {
    await this.execAdb(serial, ['shell', 'am', 'force-stop', packageId]);
  }

  async uninstallPackage(serial: string, packageId: string): Promise<boolean> {
    const res = await this.execAdb(serial, ['shell', 'pm', 'uninstall', packageId]);
    return res.stdout.includes('Success');
  }

  async dumpsysPackage(serial: string, packageId: string): Promise<string> {
    const res = await this.execAdb(serial, ['shell', 'dumpsys', 'package', packageId]);
    return res.stdout;
  }
}
