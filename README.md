# cc-setup

Claude Code supports [plugins](https://docs.anthropic.com/en/docs/claude-code/plugins) (skills, hooks, agents) and [MCP servers](https://docs.anthropic.com/en/docs/claude-code/mcp-servers) — but adding them to a new project means remembering install IDs, setting up marketplaces, and running multiple CLI commands every time.

`cc-setup` lets you **define your preferred tools once**, then add them to any project with a single command.

1. Create `~/.cc-setup.json` with your go-to plugins and MCP servers
2. Run `cc-setup` in any project
3. Pick from your list, choose the scope, done

![cc-setup demo](./demo.gif)

It ships with a small built-in list of popular plugins, but the real value is **your own curated list** — set it up once, reuse everywhere.

Add your preferred Claude Code plugins and MCP servers to any project in seconds.

## Install

```bash
# Run directly
npx @biswaviraj/cc-setup@latest

# Or install globally
pnpm add -g @biswaviraj/cc-setup@latest
cc-setup
```

## Custom tools

Create `~/.cc-setup.json` to add your own plugins and MCP servers to the picker:

```json
{
  "defaults": ["superpowers", "context-mode", "my-plugin"],
  "plugins": [
    {
      "value": "my-plugin",
      "label": "My Plugin",
      "hint": "what it does",
      "install": "my-plugin@my-marketplace",
      "marketplace": "org/repo"
    }
  ],
  "mcpServers": [
    {
      "value": "my-server",
      "label": "My Server",
      "hint": "what it does",
      "command": "npx my-mcp-server"
    }
  ]
}
```

Your entries are merged with the built-in list. No duplicates.

### Plugin fields

| Field         | Required | Description                                                     |
| ------------- | -------- | --------------------------------------------------------------- |
| `value`       | yes      | Unique ID                                                       |
| `label`       | yes      | Display name                                                    |
| `hint`        | yes      | Short description                                               |
| `install`     | yes      | Plugin install ID (e.g. `my-plugin` or `my-plugin@marketplace`) |
| `marketplace` | no       | GitHub `org/repo` for non-official marketplaces                 |

### MCP Server fields

| Field     | Required | Description                                   |
| --------- | -------- | --------------------------------------------- |
| `value`   | yes      | Unique ID                                     |
| `label`   | yes      | Display name                                  |
| `hint`    | yes      | Short description                             |
| `command` | yes      | The command to run (e.g. `npx my-mcp-server`) |

## Quick mode

Set `defaults` in your config, then:

```bash
# Install defaults, just pick scope
cc-setup --quick

# Fully non-interactive
cc-setup --quick --scope local
```

## Scopes

| Scope     | Where                         | Use case                            |
| --------- | ----------------------------- | ----------------------------------- |
| `local`   | `.claude/settings.local.json` | Just for you, this project          |
| `project` | `.claude/settings.json`       | Shared with team (committed to git) |
| `user`    | `~/.claude/settings.json`     | All projects on this machine        |

## How it works

Under the hood, `cc-setup` runs:

- `claude plugins marketplace add <repo>` for custom marketplaces
- `claude plugins install <plugin> -s <scope>` for plugins
- `claude mcp add <name> -s <scope> -- <command>` for MCP servers

That's it. No magic.

## License

MIT
