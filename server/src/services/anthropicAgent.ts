import Anthropic from '@anthropic-ai/sdk';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { TOOL_SCHEMAS } from './fileTools';
import { executeAgentTool } from './agentTools';
import { rootPath } from '../state';
import { TUTOR_SYSTEM_ADDENDUM } from './tutorSystem';

export async function loadApiKey(): Promise<string> {
  try {
    const keyFile = path.join(os.homedir(), '.anthropic', 'api_key');
    const key = await fs.promises.readFile(keyFile, 'utf-8');
    return key.trim();
  } catch {
    // fall through
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  throw new Error('API key not found');
}

const TOOLS: Anthropic.Tool[] = Object.entries(TOOL_SCHEMAS).map(([name, schema]) => ({
  name,
  description: schema.description,
  input_schema: schema.parameters as Anthropic.Tool['input_schema'],
}));

// Newer models use adaptive thinking; older models use extended thinking with a budget.
const ADAPTIVE_THINKING_MODELS = new Set(['claude-opus-4-8', 'claude-sonnet-5']);

function getThinkingParam(model: string): Anthropic.ThinkingConfigParam {
  if (ADAPTIVE_THINKING_MODELS.has(model)) {
    return { type: 'adaptive' };
  }
  return { type: 'enabled', budget_tokens: 8000 };
}

function writeSSE(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function buildSystemPrompt(activeFile: string | null, tutorMode?: boolean): string {
  const workspaceInfo = rootPath ? `Workspace: ${rootPath}` : 'No workspace is currently open.';
  const activeFileInfo = activeFile ? `The user currently has this file open in the editor: ${activeFile}` : '';
  const base = `You are a coding assistant with access to the user's project files.
${workspaceInfo}
${activeFileInfo}

You can read, write, list, and search files, and run terminal commands. When modifying files, read them first.
Be concise in your explanations. When modifying an existing file, use edit_file — supply the exact block to replace and the new content. Only use write_file when creating a brand-new file. If edit_file returns an error because old_string was not found or matched multiple times, read the file again and retry with a more unique surrounding context. If edit_file still fails to apply cleanly after a retry, or the target is ambiguous because the change spans large or repeated sections, fall back to write_file: read the file in full, then rewrite it in full with your changes applied. Never use placeholder comments like "// rest of file unchanged" or "// ..." in any file write.
When the user's message contains a **Relevant paths hint**, read or list those exact paths first using read_file or list_directory before reaching for search_files or broader directory scans. Only fall back to searching if the provided paths don't contain what you need.
Call open_file whenever you reference a specific file or a specific block of code. Use it liberally.`;
  return tutorMode ? base + TUTOR_SYSTEM_ADDENDUM : base;
}

export async function runAgentLoop(
  messages: Anthropic.MessageParam[],
  model: string,
  res: Response,
  abortSignal: { aborted: boolean },
  activeFile: string | null = null,
  customSystemPrompt?: string,
  tutorMode?: boolean,
) {
  const apiKey = await loadApiKey();
  const client = new Anthropic({ apiKey });

  const workspaceInfo = rootPath ? `Workspace: ${rootPath}` : 'No workspace is currently open.';
  const activeFileInfo = activeFile ? `The user currently has this file open in the editor: ${activeFile}` : '';
  const baseSystem = customSystemPrompt ?? `You are a coding assistant with access to the user's project files.
${workspaceInfo}
${activeFileInfo}

You can read, write, list, and search files, and run terminal commands. When modifying files, read them first.
Be concise in your explanations. When modifying an existing file, use edit_file — supply the exact block to replace and the new content. Only use write_file when creating a brand-new file. If edit_file returns an error because old_string was not found or matched multiple times, read the file again and retry with a more unique surrounding context. If edit_file still fails to apply cleanly after a retry, or the target is ambiguous because the change spans large or repeated sections, fall back to write_file: read the file in full, then rewrite it in full with your changes applied. Never use placeholder comments like "// rest of file unchanged" or "// ..." in any file write.
When the user's message contains a **Relevant paths hint**, read or list those exact paths first using read_file or list_directory before reaching for search_files or broader directory scans. Only fall back to searching if the provided paths don't contain what you need.
Call open_file whenever you reference a specific file or a specific block of code. Use it liberally.`;
  const system = tutorMode ? baseSystem + TUTOR_SYSTEM_ADDENDUM : baseSystem;

  const history = [...messages];

  while (true) {
    if (abortSignal.aborted) return;

    const stream = client.messages.stream({
      model,
      max_tokens: 32000,
      thinking: getThinkingParam(model),
      system,
      tools: TOOLS,
      messages: history,
    });

    for await (const event of stream) {
      if (abortSignal.aborted) return;
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          writeSSE(res, 'text_delta', { text: event.delta.text });
        } else if (event.delta.type === 'thinking_delta') {
          writeSSE(res, 'thought_delta', { text: event.delta.thinking });
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    if (abortSignal.aborted) return;

    const toolUseBlocks = finalMessage.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolUseBlocks.length === 0) {
      writeSSE(res, 'done', {});
      return;
    }

    const contentForHistory = finalMessage.content.filter(
      b => b.type !== 'thinking' || (b as Anthropic.ThinkingBlock).thinking.length > 0
    );
    history.push({ role: 'assistant', content: contentForHistory });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUseBlocks) {
      if (abortSignal.aborted) return;
      writeSSE(res, 'tool_call', { id: toolUse.id, name: toolUse.name, input: toolUse.input });

      const result = await executeAgentTool(toolUse.name, toolUse.input as Record<string, unknown>, res, abortSignal);
      writeSSE(res, 'tool_result', {
        tool_use_id: toolUse.id,
        name: toolUse.name,
        preview: result.preview,
        error: result.error,
      });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: result.error,
      });
    }

    history.push({ role: 'user', content: toolResults });
  }
}
