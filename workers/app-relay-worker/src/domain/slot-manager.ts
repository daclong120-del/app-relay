// Device Slot Manager (Enforces max_parallel_jobs = 1 per worker ADB device)

export class DeviceSlotManager {
  private activeJobId: string | null = null;
  private readonly maxSlots: number;

  constructor(maxSlots = 1) {
    this.maxSlots = Math.max(1, maxSlots);
  }

  hasAvailableSlot(): boolean {
    return this.activeJobId === null;
  }

  getAvailableSlots(): number {
    return this.hasAvailableSlot() ? this.maxSlots : 0;
  }

  getActiveJobId(): string | null {
    return this.activeJobId;
  }

  tryAcquireSlot(jobId: string): boolean {
    if (!this.hasAvailableSlot()) {
      return false;
    }
    this.activeJobId = jobId;
    return true;
  }

  releaseSlot(jobId: string): boolean {
    if (this.activeJobId === jobId) {
      this.activeJobId = null;
      return true;
    }
    return false;
  }
}
