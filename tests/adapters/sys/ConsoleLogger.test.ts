import { ConsoleLogger } from '../../../src/adapters/sys/ConsoleLogger';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;
  let debugSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = new ConsoleLogger();
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('debug logs message and meta', () => {
    logger.debug('hello', { a: 1 });
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(String(debugSpy.mock.calls[0][0])).toContain('hello');
    expect(String(debugSpy.mock.calls[0][0])).toContain('"a":1');
  });

  test('info logs message', () => {
    logger.info('world');
    expect(infoSpy).toHaveBeenCalledWith('world');
  });

  test('warn logs message only when no meta', () => {
    logger.warn('careful');
    expect(warnSpy).toHaveBeenCalledWith('careful');
  });

  test('error logs with meta when provided', () => {
    logger.error('oops', { reason: 'bad' });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('oops');
    expect(String(errorSpy.mock.calls[0][0])).toContain('"reason":"bad"');
  });
});
