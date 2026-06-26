#!/usr/bin/env node

import * as p from "@clack/prompts";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";
import pkg from "../package.json";

// ── Types ───────────────────────────────────────────────────

interface Plugin {
  value: string;
  label: string;
  hint: string;
  install: string;
  marketplace?: string;
}

interface McpServer {
  value: string;
  label: string;
  hint: string;
  command: string;
}

interface UserConfig {
  defaults?: string[];
  plugins?: Plugin[];
  mcpServers?: McpServer[];
}

interface RunResult {
  ok: boolean;
  output: string;
}

interface InstallResult extends RunResult {
  name: string;
}

// ── Built-in Registry ───────────────────────────────────────
// Popular plugins & servers. Users can extend via ~/.cc-setup.json

const BUILTIN_PLUGINS: Plugin[] = [
  {
    value: "superpowers",
    label: "Superpowers",
    hint: "brainstorming, TDD, debugging, plans, worktrees",
    install: "superpowers",
  },
  {
    value: "frontend-design",
    label: "Frontend Design",
    hint: "production-grade UI components",
    install: "frontend-design",
  },
  {
    value: "context-mode",
    label: "Context Mode",
    hint: "context window optimization",
    install: "context-mode@context-mode",
    marketplace: "mksglu/context-mode",
  },
  {
    value: "context7",
    label: "Context7",
    hint: "library & framework docs lookup",
    install: "context7-plugin@context7-marketplace",
    marketplace: "upstash/context7",
  },
  {
    value: "feature-dev",
    label: "Feature Dev",
    hint: "guided feature development",
    install: "feature-dev",
  },
  {
    value: "mongodb",
    label: "MongoDB",
    hint: "database ops, schema design, queries",
    install: "mongodb",
  },
  {
    value: "biswaviraj-skills",
    label: "Biswaviraj's Skills",
    hint: "reviewloop (clear PR reviews) + ciloop (fix red CI) + standup (daily standup)",
    install: "agent-workflows@biswaviraj-skills",
    marketplace: "BiswaViraj/agent-skills",
  },
];

const BUILTIN_MCP: McpServer[] = [];

// ── Config ──────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), ".cc-setup.json");

function loadConfig(): UserConfig | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as UserConfig;
  } catch {
    return null;
  }
}

function merge<T extends { value: string }>(builtin: T[], user?: T[]): T[] {
  if (!user?.length) return builtin;
  const seen = new Set(builtin.map((t) => t.value));
  return [...builtin, ...user.filter((t) => !seen.has(t.value))];
}

// ── Helpers ─────────────────────────────────────────────────

const execAsync = promisify(exec);

// Async so the @clack spinner keeps animating while the command runs
// (execSync blocks the event loop → frozen spinner → looks stuck).
async function run(cmd: string): Promise<RunResult> {
  try {
    const { stdout } = await execAsync(cmd, { encoding: "utf-8" });
    return { ok: true, output: stdout.trim() };
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    return { ok: false, output: (err.stderr || err.message).trim() };
  }
}

interface CliArgs {
  quick: boolean;
  scope: string | null;
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  return {
    quick: args.includes("--quick") || args.includes("-q"),
    scope: args.find((_, i, a) => a[i - 1] === "--scope") || null,
    help: args.includes("--help") || args.includes("-h"),
  };
}

// ── Main ────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    console.log(`
  ${pc.bold("cc-setup")} — Add Claude Code plugins & MCP servers to any project

  ${pc.dim("Usage:")}
    cc-setup                        Interactive picker
    cc-setup --quick                Install defaults from config
    cc-setup --quick --scope local  Fully non-interactive

  ${pc.dim("Config:")} ~/.cc-setup.json

    {
      "defaults": ["superpowers", "playwright"],
      "plugins": [
        { "value": "id", "label": "Name", "hint": "description", "install": "id@marketplace", "marketplace": "org/repo" }
      ],
      "mcpServers": [
        { "value": "id", "label": "Name", "hint": "description", "command": "npx my-server" }
      ]
    }

  ${pc.dim("Fields:")}
    plugins.marketplace   Optional. GitHub repo for non-official marketplaces.
    defaults              Tool IDs to install with --quick.
`);
    process.exit(0);
  }

  console.clear();
  p.intro(`${pc.bgCyan(pc.black(" cc-setup "))} ${pc.dim(`v${pkg.version}`)}`);

  // Preflight
  const check = await run("claude --version");
  if (!check.ok) {
    p.cancel(
      "Claude Code CLI not found. Install: npm i -g @anthropic-ai/claude-code",
    );
    process.exit(1);
  }
  p.log.info(`${pc.dim("Claude Code")} ${check.output}`);

  // Load & merge
  const config = loadConfig();
  if (config) p.log.info(`${pc.dim("Config loaded from")} ${CONFIG_PATH}`);

  const plugins = merge(BUILTIN_PLUGINS, config?.plugins);
  const mcpServers = merge(BUILTIN_MCP, config?.mcpServers);
  const defaults = config?.defaults || [];

  const pluginMap = new Map(plugins.map((pl) => [pl.value, pl]));
  const mcpMap = new Map(mcpServers.map((m) => [m.value, m]));

  // ── Select ────────────────────────────────────────────────

  let selectedIds: string[];

  if (args.quick) {
    if (!defaults.length) {
      p.cancel('No defaults configured. Add "defaults" to ~/.cc-setup.json');
      process.exit(1);
    }
    selectedIds = defaults;
    p.log.info(`Using defaults: ${defaults.map((d) => pc.cyan(d)).join(", ")}`);
  } else {
    const groups: Record<
      string,
      { value: string; label: string; hint: string }[]
    > = {};

    if (plugins.length)
      groups["Plugins"] = plugins.map((t) => ({
        value: t.value,
        label: t.label,
        hint: t.hint,
      }));

    if (mcpServers.length)
      groups["MCP Servers"] = mcpServers.map((t) => ({
        value: t.value,
        label: t.label,
        hint: t.hint,
      }));

    const result = await p.groupMultiselect({
      message: "Pick tools to add",
      options: groups,
      required: false,
    });

    if (p.isCancel(result) || !result.length) {
      p.cancel("Nothing selected.");
      process.exit(0);
    }

    selectedIds = result as string[];
  }

  const pluginIds = selectedIds.filter((id) => pluginMap.has(id));
  const mcpIds = selectedIds.filter((id) => mcpMap.has(id));

  if (!pluginIds.length && !mcpIds.length) {
    p.cancel("Nothing to install.");
    process.exit(0);
  }

  // ── Scope ─────────────────────────────────────────────────

  let scope = args.scope;

  if (!scope) {
    const result = await p.select({
      message: "Install scope",
      options: [
        {
          value: "local",
          label: "This project",
          hint: ".claude/settings.local.json",
        },
        {
          value: "project",
          label: "Shared with team",
          hint: ".claude/settings.json (committed)",
        },
        {
          value: "user",
          label: "Global",
          hint: "~/.claude/settings.json",
        },
      ],
    });

    if (p.isCancel(result)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }

    scope = result as string;
  }

  // ── Install ───────────────────────────────────────────────

  const s = p.spinner();
  const results: InstallResult[] = [];

  for (const id of pluginIds) {
    const plugin = pluginMap.get(id)!;

    if (plugin.marketplace) {
      s.start(`Adding marketplace for ${plugin.label}...`);
      await run(`claude plugins marketplace add ${plugin.marketplace}`);
      // `add` no-ops if the marketplace already exists, leaving a stale cache —
      // refresh it so newly added plugins resolve. Marketplace name is the part
      // after "@" in the install ref (e.g. "reviewloop@biswaviraj-skills").
      const marketplaceName = plugin.install.split("@")[1];
      if (marketplaceName) {
        await run(`claude plugins marketplace update ${marketplaceName}`);
      }
      s.stop(`Marketplace ready for ${plugin.label}`);
    }

    s.start(`Installing ${plugin.label}...`);
    const result = await run(`claude plugins install ${plugin.install} -s ${scope}`);
    s.stop(`${result.ok ? pc.green("✓") : pc.yellow("⚠")} ${plugin.label}`);
    results.push({ name: plugin.label, ...result });
  }

  for (const id of mcpIds) {
    const mcp = mcpMap.get(id)!;
    s.start(`Adding ${mcp.label}...`);
    const result = await run(
      `claude mcp add ${mcp.value} -s ${scope} -- ${mcp.command}`,
    );
    s.stop(`${result.ok ? pc.green("✓") : pc.yellow("⚠")} ${mcp.label}`);
    results.push({ name: mcp.label, ...result });
  }

  // ── Summary ───────────────────────────────────────────────

  const summary = results
    .map((r) => {
      if (r.ok) return `  ${pc.green("✓")} ${r.name}`;
      return `  ${pc.red("✗")} ${r.name} ${pc.dim(`— ${r.output.split("\n")[0]}`)}`;
    })
    .join("\n");

  p.note(summary, "Results");
  p.outro("Restart Claude Code to activate new tools.");
}

main().catch(console.error);
