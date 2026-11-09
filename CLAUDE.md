# Founder Town

A Gather-style 2D top-down virtual space. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first and follow its rules.

## Commands

| Command               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `npm run dev`         | Start the client dev server                          |
| `npm run build`       | Type-check all projects and build client             |
| `npm test`            | Run all tests with vitest                            |
| `npm run lint`        | Run oxlint                                           |
| `npm run format`      | Format with prettier                                 |
| `npm run art:build`   | Generate PNG atlases + JSON from art data            |
| `npm run art:preview` | Open the sprite gallery                              |
| `npm run art:measure` | Re-measure `docs/references` into `native/`          |
| `npm run art:export`  | Render the gallery to `packages/art/out/preview.png` |

## Working rules

- One step per session.
- After visual changes, export a PNG and compare it to `docs/references`.
