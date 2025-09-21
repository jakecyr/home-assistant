import { FunctionToolRegistry, type FunctionTool } from '../../../src/adapters/tools/FunctionToolRegistry';

describe('FunctionToolRegistry', () => {
  const okTool: FunctionTool = {
    name: 'ok',
    description: 'ok tool',
    schema: { type: 'object', properties: {} },
    exec: jest.fn(async () => ({ ok: true, message: 'done' })),
  };
  const failTool: FunctionTool = {
    name: 'fail',
    description: 'always fails',
    schema: { type: 'object', properties: {} },
    exec: jest.fn(async () => { throw new Error('boom'); }),
  };

  test('list exposes tool definitions', () => {
    const reg = new FunctionToolRegistry([okTool]);
    const list = reg.list();
    expect(list).toEqual([
      { name: 'ok', description: 'ok tool', schema: { type: 'object', properties: {} } },
    ]);
  });

  test('exec runs a registered tool and returns its result', async () => {
    const reg = new FunctionToolRegistry([okTool]);
    const res = await reg.exec('ok', { a: 1 });
    expect(res).toEqual({ ok: true, message: 'done' });
    expect(okTool.exec).toHaveBeenCalledWith({ a: 1 });
  });

  test('exec returns error when tool missing', async () => {
    const reg = new FunctionToolRegistry([]);
    const res = await reg.exec('missing', {});
    expect(res.ok).toBe(false);
    expect(String(res.message)).toContain('not registered');
  });

  test('exec catches tool exception and returns structured error', async () => {
    const reg = new FunctionToolRegistry([failTool]);
    const res = await reg.exec('fail', {});
    expect(res.ok).toBe(false);
    expect(String(res.message)).toContain('failed');
  });
});
