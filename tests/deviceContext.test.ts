import {
  buildDeviceContextSummary,
  buildDeviceDescriptors,
  getAllDeviceNames,
  inferActionFromText,
  shouldContinueConversation,
} from '../src/deviceContext';
import type { AppConfig } from '../src/config';

describe('device context helpers', () => {
  const config: AppConfig = {
    tplink: {
      devices: {
        tall_lamp: {
          ip: '192.168.1.10',
          room: 'living room',
          aliases: ['tall lamp', 'floor lamp'],
        },
      },
    },
  };

  test('buildDeviceContextSummary lists devices', () => {
    const summary = buildDeviceContextSummary(config, ['tplink_toggle']);
    expect(summary).toContain('TP-Link devices available');
    expect(summary).toContain('"tall_lamp"');
  });

  test('buildDeviceContextSummary returns null when no devices', () => {
    expect(buildDeviceContextSummary({}, ['tplink_toggle'])).toBeNull();
  });

  test('buildDeviceContextSummary skips tools that are disabled', () => {
    const summary = buildDeviceContextSummary(config, ['tplink_toggle']);
    expect(summary).toContain('"tall_lamp"');
    expect(summary).not.toContain('"sofa_light"');
  });

  test('getAllDeviceNames returns all device keys', () => {
    expect(getAllDeviceNames(config, ['tplink_toggle'])).toEqual(['tall_lamp']);
    expect(getAllDeviceNames(config, ['tplink_toggle'])).toEqual(['tall_lamp']);
  });

  test('buildDeviceDescriptors includes aliases and rooms', () => {
    const descriptors = buildDeviceDescriptors(config, ['tplink_toggle']);
    const tallLamp = descriptors.find((d) => d.name === 'tall_lamp');
    expect(tallLamp).toBeDefined();
    expect(tallLamp?.aliases).toEqual(
      expect.arrayContaining(['tall lamp', 'floor lamp', 'living room']),
    );
  });

  test('inferActionFromText detects intents', () => {
    expect(inferActionFromText('Please turn off the lights')).toBe('off');
    expect(inferActionFromText('Could you switch on the lamp?')).toBe('on');
    expect(inferActionFromText('Toggle the plug')).toBe('toggle');
    expect(inferActionFromText('Leave it alone')).toBeNull();
  });

  test('shouldContinueConversation detects questions and confirmations', () => {
    expect(shouldContinueConversation('What should I do?')).toBe(true);
    expect(shouldContinueConversation('Please say yes or no.')).toBe(true);
    expect(shouldContinueConversation('All done.')).toBe(false);
  });
});
