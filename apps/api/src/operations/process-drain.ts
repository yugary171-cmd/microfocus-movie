import { BeforeApplicationShutdown, Injectable } from "@nestjs/common";

@Injectable()
export class ProcessDrain implements BeforeApplicationShutdown {
  private draining = false;

  isDraining(): boolean {
    return this.draining;
  }

  markDraining(): void {
    this.draining = true;
  }

  beforeApplicationShutdown(): void {
    this.markDraining();
  }
}
