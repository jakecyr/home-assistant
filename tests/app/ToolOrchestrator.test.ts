import { ToolOrchestrator } from '../../src/app/ToolOrchestrator';
import type { LlmMessage } from '../../src/app/LlmPort';
import type { ToolExecutionResult, ToolDefinition } from '../../src/ports/tools/ToolRegistryPort';

function makeLlm() {
  return {
    completeStructured: jest.fn(),
  } as any;
}

function makeTools(defs: ToolDefinition[] = []) {
  return {
    list: jest.fn(() => defs),
    exec: jest.fn(),
  } as any;
}

describe('ToolOrchestrator', () => {
  test('returns first assistant action when no tool calls', async () => {
    const llm = makeLlm();
    const tools = makeTools([]);
    const orch = new ToolOrchestrator(llm, tools);

    const assistantMessage: LlmMessage = { role: 'assistant', content: 'Hello' };
    llm.completeStructured.mockResolvedValueOnce({
      assistantMessage,
      action: { reply_text: 'Hello', expect_user_response: false, tool_calls: [] },
    });

    const result = await orch.run([{ role: 'user', content: 'Hi' }]);

    expect(result.toolUsed).toBe(false);
    expect(result.action).toEqual({ reply_text: 'Hello', expect_user_response: false, tool_calls: [] });
    expect(result.appendedMessages).toContainEqual(assistantMessage);

    // toolChoice should be 'none' and tools listed
    expect(tools.list).toHaveBeenCalled();
    expect(llm.completeStructured).toHaveBeenCalled();
  });

  test('executes tools when requested and performs second completion', async () => {
    const defs: ToolDefinition[] = [
      { name: 'add', description: 'adds', schema: { type: 'object' } },
    ];
    const tools = makeTools(defs);
    const llm = makeLlm();
    const orch = new ToolOrchestrator(llm, tools);

    const firstAssistant: LlmMessage = { role: 'assistant', content: 'use tool' };
    llm.completeStructured.mockResolvedValueOnce({
      assistantMessage: firstAssistant,
      action: {
        reply_text: '',
        expect_user_response: false,
        tool_calls: [
          { name: 'add', arguments_json: JSON.stringify({ a: 1, b: 2 }) },
        ],
      },
    });

    tools.exec.mockResolvedValueOnce({ ok: true, data: 3 } as ToolExecutionResult);

    const secondAssistant: LlmMessage = { role: 'assistant', content: 'done' };
    llm.completeStructured.mockResolvedValueOnce({
      assistantMessage: secondAssistant,
      action: { reply_text: '3', expect_user_response: false, tool_calls: [] },
    });

    const result = await orch.run([{ role: 'user', content: 'sum 1 and 2' }]);

    expect(result.toolUsed).toBe(true);
    expect(tools.exec).toHaveBeenCalledWith('add', { a: 1, b: 2 });
    // appended should include first assistant, tool message, and second assistant
    expect(result.appendedMessages).toEqual(
      expect.arrayContaining([
        firstAssistant,
        expect.objectContaining({ role: 'tool', name: 'add' }),
        secondAssistant,
      ])
    );
    expect(result.action.reply_text).toBe('3');
  });

  test('invalid arguments_json logs warning and passes empty args', async () => {
    const defs: ToolDefinition[] = [ { name: 'x', description: '', schema: {} } ];
    const tools = makeTools(defs);
    const llm = makeLlm();
    const orch = new ToolOrchestrator(llm, tools);

    llm.completeStructured.mockResolvedValueOnce({
      assistantMessage: { role: 'assistant', content: 'tool' },
      action: {
        reply_text: '',
        expect_user_response: false,
        tool_calls: [ { name: 'x', arguments_json: '{ not json' } ],
      },
    });

    tools.exec.mockResolvedValueOnce({ ok: true } as ToolExecutionResult);

    llm.completeStructured.mockResolvedValueOnce({
      assistantMessage: { role: 'assistant', content: 'final' },
      action: { reply_text: 'ok', expect_user_response: false, tool_calls: [] },
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await orch.run([{ role: 'user', content: 'do x' }]);

    expect(warnSpy).toHaveBeenCalled();
    expect(tools.exec).toHaveBeenCalledWith('x', {});

    warnSpy.mockRestore();
  });

  test('tool exec error is captured in result content', async () => {
    const defs: ToolDefinition[] = [ { name: 'boom', description: '', schema: {} } ];
    const tools = makeTools(defs);
    const llm = makeLlm();
    const orch = new ToolOrchestrator(llm, tools);

    llm.completeStructured.mockResolvedValueOnce({
      assistantMessage: { role: 'assistant', content: 'call' },
      action: { reply_text: '', expect_user_response: false, tool_calls: [ { name: 'boom', arguments_json: '{}' } ] },
    });

    tools.exec.mockRejectedValueOnce(new Error('kaboom'));

    llm.completeStructured.mockResolvedValueOnce({
      assistantMessage: { role: 'assistant', content: 'after' },
      action: { reply_text: 'after', expect_user_response: false, tool_calls: [] },
    });

    const result = await orch.run([{ role: 'user', content: 'boom' }]);

    const toolMsg = result.appendedMessages.find(m => m.role === 'tool');
    expect(toolMsg).toBeTruthy();
    if (toolMsg) {
      const parsed = JSON.parse(toolMsg.content as any);
      expect(parsed.ok).toBe(false);
      expect(parsed.message).toMatch(/Tool "boom" failed: kaboom/);
    }
  });
});
