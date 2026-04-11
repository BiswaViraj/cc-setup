#!/usr/bin/env node

import * as p from "@clack/prompts";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pc from "picocolors";

// ── Built-in Registry ───────────────────────────────────────
// Popular plugins & servers. Users can extend via ~/.cc-setup.json

const BUILTIN_PLUGINS = [
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
];

const BUILTIN_MCP = [];

// ── Config ──────────────────────────────────────────────────

const CONFIG_PATH = join(homedir(), ".cc-setup.json");

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function merge(builtin, user) {
  if (!user?.length) return builtin;
  const seen = new Set(builtin.map((t) => t.value));
  return [...builtin, ...user.filter((t) => !seen.has(t.value))];
}

// ── Helpers ─────────────────────────────────────────────────

function run(cmd) {
  try {
    return {
      ok: true,
      output: execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim(),
    };
  } catch (e) {
    return { ok: false, output: (e.stderr || e.message).trim() };
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    quick: args.includes("--quick") || args.includes("-q"),
    scope: args.find((_, i, a) => a[i - 1] === "--scope") || null,
    help: args.includes("--help") || args.includes("-h"),
  };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
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
  p.intro(`${pc.bgCyan(pc.black(" cc-setup "))} ${pc.dim("v1.0.0")}`);

  // Preflight
  const check = run("claude --version");
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

  let selectedIds;

  if (args.quick) {
    if (!defaults.length) {
      p.cancel('No defaults configured. Add "defaults" to ~/.cc-setup.json');
      process.exit(1);
    }
    selectedIds = defaults;
    p.log.info(`Using defaults: ${defaults.map((d) => pc.cyan(d)).join(", ")}`);
  } else {
    const groups = {};
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

    selectedIds = await p.groupMultiselect({
      message: "Pick tools to add",
      options: groups,
      required: false,
    });

    if (p.isCancel(selectedIds) || !selectedIds.length) {
      p.cancel("Nothing selected.");
      process.exit(0);
    }
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
    scope = await p.select({
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

    if (p.isCancel(scope)) {
      p.cancel("Cancelled.");
      process.exit(0);
    }
  }

  // ── Install ───────────────────────────────────────────────

  const s = p.spinner();
  const results = [];

  for (const id of pluginIds) {
    const plugin = pluginMap.get(id);

    if (plugin.marketplace) {
      s.start(`Adding marketplace for ${plugin.label}...`);
      run(`claude plugins marketplace add ${plugin.marketplace}`);
      s.stop(`Marketplace ready for ${plugin.label}`);
    }

    s.start(`Installing ${plugin.label}...`);
    const result = run(`claude plugins install ${plugin.install} -s ${scope}`);
    s.stop(`${result.ok ? pc.green("✓") : pc.yellow("⚠")} ${plugin.label}`);
    results.push({ name: plugin.label, ...result });
  }

  for (const id of mcpIds) {
    const mcp = mcpMap.get(id);
    s.start(`Adding ${mcp.label}...`);
    const result = run(
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
