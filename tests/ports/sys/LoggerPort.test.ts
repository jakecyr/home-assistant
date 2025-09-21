import type { LoggerPort } from '../../../src/ports/sys/LoggerPort';

describe('LoggerPort contract (dummy implementation)', () => {
  class FakeLogger implements LoggerPort {
    logs: { level: string; message: string; meta?: Record<string, unknown> }[] = [];
    debug(message: string, meta?: Record<string, unknown>): void { this.logs.push({ level: 'debug', message, meta }); }
    info(message: string, meta?: Record<string, unknown>): void { this.logs.push({ level: 'info', message, meta }); }
    warn(message: string, meta?: Record<string, unknown>): void { this.logs.push({ level: 'warn', message, meta }); }
    error(message: string, meta?: Record<string, unknown>): void { this.logs.push({ level: 'error', message, meta }); }
  }

  test('supports level methods with optional meta', () => {
    const log = new FakeLogger();
    log.info('hello');
    log.error('oops', { code: 500 });

    expect(log.logs[0]).toMatchObject({ level: 'info', message: 'hello' });
    expect(log.logs[1]).toMatchObject({ level: 'error', message: 'oops', meta: { code: 500 } });
  });
});
