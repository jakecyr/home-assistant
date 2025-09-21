import { TimeNowTool } from '../../src/features/TimeTools/TimeNowTool';
import type { TimePort } from '../../src/ports/sys/TimePort';

describe('TimeNowTool', () => {
  function makeTimePort(nowMs: number): TimePort {
    return {
      now: () => nowMs,
      toLocaleTimeString: (ms: number) => new Date(ms).toLocaleTimeString(),
      toIsoString: (ms: number) => new Date(ms).toISOString(),
    } as any;
  }

  test('returns formatted time with provided timezone and locale', async () => {
    const fixed = Date.UTC(2024, 0, 2, 15, 4, 5); // 2024-01-02T15:04:05Z
    const time = makeTimePort(fixed);
    const tool = new TimeNowTool(time);

    const timezone = 'UTC';
    const locale = 'en-US';

    const expected = new Intl.DateTimeFormat(locale, {
      dateStyle: 'full',
      timeStyle: 'medium',
      timeZone: timezone,
    }).format(new Date(fixed));

    const res = await tool.exec({ timezone, locale });

    expect(res.ok).toBe(true);
    expect(res.message).toBe(`It is currently ${expected} (${timezone}).`);
    expect(res.data?.iso).toBe(new Date(fixed).toISOString());
    expect(res.data?.timezone).toBe(timezone);
    expect(res.data?.locale).toBe(locale);
  });

  test('handles invalid timezone with friendly error', async () => {
    const time = makeTimePort(Date.now());
    const tool = new TimeNowTool(time);

    const res = await tool.exec({ timezone: 'Invalid/Zone' });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/Failed to format time:/);
  });
});
