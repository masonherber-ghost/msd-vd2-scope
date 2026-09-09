---
name: figma-mcp
description: Sets up the Figma Desktop MCP connection so Claude can read design values directly from Figma.
---

## Prerequisites

Before running this skill, confirm the following with the user:

1. **Figma Desktop** is installed (not just the browser version)
2. **Figma Desktop is open** with the project file loaded
3. The **Dev Mode MCP server** is enabled in Figma Desktop:
   - Open Figma Desktop → top menu → **Figma > Preferences**
   - Enable **"Allow MCP connections"** (or similar — exact label depends on Figma version)

If any of these are not met, ask the user to complete them before continuing.

---

## Step 1 — Register the MCP server

Run this command to register the Figma Desktop MCP server with Claude Code:

```bash
claude mcp add --transport http figma-desktop http://127.0.0.1:3845/mcp
```

This only needs to be done once per project.

---

## Step 2 — Verify the connection

Run this command to check the server is reachable:

```bash
claude mcp list
```

**Expected output:**
```
figma-desktop: http://127.0.0.1:3845/mcp (HTTP) - ✓ Connected
```

If it shows `✗ Failed` or `No MCP servers configured`:
- Confirm Figma Desktop is open (not just the browser app)
- Check the MCP preference is enabled in Figma Desktop settings
- Try closing and reopening Figma Desktop, then re-run the check

---

## Step 3 — Confirm with the user

Once connected, tell the user:

> Figma MCP is connected. You can now use `/figma-css-tokens` to extract design tokens, or `/component-from-design` and `/page-from-design` with a Figma URL.

Ask them to select a frame or layer in Figma, then type **yes** to confirm — this validates the connection end-to-end.



