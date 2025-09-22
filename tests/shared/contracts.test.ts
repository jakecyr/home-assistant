import { ASSISTANT_ACTION_JSON_SCHEMA } from '../../src/shared/contracts';

describe('shared/contracts ASSISTANT_ACTION_JSON_SCHEMA', () => {
  test('has expected top-level shape', () => {
    expect(ASSISTANT_ACTION_JSON_SCHEMA).toHaveProperty('name', 'assistant_action');
    expect(ASSISTANT_ACTION_JSON_SCHEMA).toHaveProperty('schema');
  });

  test('defines required properties and types', () => {
    const s: any = ASSISTANT_ACTION_JSON_SCHEMA.schema;
    expect(s.type).toBe('object');
    const props = s.properties;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['reply_text', 'tool_calls', 'expect_user_response'])
    );

    // reply_text
    expect(props.reply_text.type).toBe('string');

    // tool_calls
    expect(props.tool_calls.type).toBe('array');
    expect(props.tool_calls.items.type).toBe('object');
    expect(props.tool_calls.items.required).toEqual(
      expect.arrayContaining(['name', 'arguments_json'])
    );

    // expect_user_response
    expect(props.expect_user_response.type).toBe('boolean');

    // required list at root
    expect(s.required).toEqual(
      expect.arrayContaining(['reply_text', 'tool_calls', 'expect_user_response'])
    );
    expect(s.additionalProperties).toBe(false);
  });
});
