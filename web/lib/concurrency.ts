export class ConcurrencyLimiter {
  private active = 0;

  constructor(private readonly limit: number) {}

  tryAcquire(): boolean {
    if (this.active >= this.limit) {
      return false;
    }

    this.active += 1;
    return true;
  }

  release(): void {
    if (this.active > 0) {
      this.active -= 1;
    }
  }

  getActiveCount(): number {
    return this.active;
  }
}