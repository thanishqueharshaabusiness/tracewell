import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export interface ClaudeServiceOptions {
  tools?: Anthropic.Tool[];
}

export async function callClaude(
  systemPrompt: string,
  userContent: Anthropic.MessageParam['content'],
  options: ClaudeServiceOptions = {}
): Promise<string> {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  };

  if (options.tools) {
    params.tools = options.tools;
  }

  const response = await anthropic.messages.create(params);

  const textBlock = response.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined;
  return textBlock ? textBlock.text : '';
}

export async function streamClaude(
  systemPrompt: string,
  userContent: Anthropic.MessageParam['content'],
  onChunk: (text: string) => void
): Promise<void> {
  const stream = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    stream: true,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      onChunk(event.delta.text);
    }
  }
}
