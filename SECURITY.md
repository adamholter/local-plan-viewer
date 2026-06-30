# Security Notes

This repo is intended for local use on trusted plan folders.

## What was removed from the public copy

- Private daily brief data
- Personal file paths from the default configuration
- Real screenshots containing names, email addresses, or internal workflow details

## Current behavior

- The server binds to `127.0.0.1` by default.
- The bundled demo data is synthetic.
- `render.js` strips `<script>` tags and inline event handlers from diagram HTML before rendering.

## Before using real plan data

- Review any screenshot or exported HTML before sharing it publicly.
- Keep the viewer pointed at trusted local folders only.
- Avoid exposing the local HTTP port beyond your machine unless you add your own access controls.
