# Changelog

All notable changes to **`@orangecheck/mcp`** will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-11-21

First release: a stdio MCP server that needs no credential.

- Tools: `search_docs`, `list_docs`, `read_doc`, `get_project_config`,
  `check_domain_verification`, `check_setup`, `integration_guide` (nextjs-pages,
  nextjs-app, express, hono, python, godot). All read-only.
- Resources: the docs index and every docs page as `orangecheck://docs/{route}`.
- Prompts: `set_up_sign_in`, `pre_launch_check`.
- Guides copy every code block from the page they cite and say when an excerpt
  is gone, rather than filling the gap.
- Site checks refuse IP addresses and hosts that resolve to private or local
  addresses, and follow redirects only to the domain or its www twin.
- Built on `@modelcontextprotocol/server` 2.4.0, which answers clients of every
  protocol version from 2024-10-07 on.
