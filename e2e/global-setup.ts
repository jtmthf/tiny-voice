import { rmSync } from 'node:fs';

export default function globalSetup(): void {
  rmSync('./data/e2e-test.db', { force: true });
}
