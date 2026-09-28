<p align="center">
  <img src="images/iodine_logo_2-preview.png" alt="Iodine" width="140" />
</p>

<h1 align="center">Iodine</h1>

<p align="center">A browser-based IDE for exploring and working with unfamiliar codebases, with an integrated AI assistant, architecture diagram generator, and live voice sessions.</p>

<p align="center">
<a href="https://youtu.be/tB9BLJ8Brzs">Full demo</a> · <a href="https://youtube.com/shorts/VeYM4Gd6_Pc?feature=share">Demo 1</a> · <a href="https://youtu.be/DFy1F0CQmN8">Demo 2</a> · <a href="https://www.youtube.com/watch?v=66pxz-CJ_sg">Demo 4</a> · <a href="https://youtu.be/DzGt5jQaSo8">Demo 5</a>
</p>

<img width="1279" height="689" alt="Iodine screenshot" src="https://github.com/user-attachments/assets/7fbbe29e-9f30-4b1f-8ab4-6e204e36e84d" />

## Installation

```bash
npm install -g iodine-ide
```

Requires Node.js 18+ and at least one AI provider API key (Anthropic, OpenAI, or Google).

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY / GOOGLE_API_KEY

iodine
```

Opens in your browser at http://localhost:3001. To use a different port: `PORT=4000 iodine`.

To update: `npm install -g iodine-ide@latest`.

## Features

- **Monaco editor** with Git diff gutter, merge conflict resolver, and tab management
- **Coding Assistant** — agentic file editing with `edit_file` / `write_file` tools, revert support, and conversation history
- **Mentor mode** — guided walkthroughs that open files, highlight lines, and explain one block at a time without making changes
- **Live voice sessions** — real-time conversation via Gemini Live that reads files, navigates code, and drops a full transcript back into the chat
- **AI summaries** — cached per-file and per-directory summaries with a Markdown preview and table-of-contents sidebar
- **System View** — interactive architecture graph generated from the codebase; nodes link back to source locations
- **Build assistant** — generates and runs project-specific test, build, and run commands
- **Integrated terminal** — full PTY sessions via xterm.js
- Supports Anthropic Claude, OpenAI GPT, and Google Gemini

## Running from source

```bash
git clone https://github.com/hyunwookshin/iodine.git
cd iodine
npm install
cp .env.example .env  # add your API keys
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

```bash
npm test           # run the test suite
npm run build      # production build
npm run typecheck  # TypeScript checks across the monorepo
```

For architecture details and contributor workflows, see [CONTRIBUTING.md](CONTRIBUTING.md).

