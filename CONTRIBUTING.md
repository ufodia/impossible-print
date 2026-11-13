# Contribute another useful point of view

Impossible Print is maintained by ufodia under MIT. Contributions that improve reproducible geometry, browser compatibility, print instructions and accessibility are welcome.

## Work locally

Use Node.js 24, run `npm ci`, then `npm run dev`. Before proposing a change, run `npm run verify` and the relevant [browser checks](docs/testing.md). Use `npm run format:check` to inspect formatting and `npm run format` when you intend to format your changes.

Keep changes focused. Explain the user-visible problem, the resulting behaviour and the checks you ran. Preserve the coordinate convention and versioned project contract; document any proposed incompatible change before changing saved-file behaviour.

## Geometry and print changes

Include a minimal synthetic project with exact dimensions, camera point and expected result. Test forward/inverse consistency, clipping, seam orientation and output budgets where relevant. If you report a physical print result, record actual ruler measurements and printer settings; a screenshot alone cannot verify print scale.

## Images and dependencies

Use original or appropriately licensed assets. Do not commit private photos, local exports, generated build output or credentials. Keep third-party license notices intact and update the lockfile when changing dependencies. See [third-party notices](THIRD_PARTY_NOTICES.md).

## Issues and discussions

Public bug reports should include the source version, browser/OS, reproduction steps and a nonprivate sample. Discuss larger feature ideas before writing a broad implementation. For sensitive findings, follow [SECURITY.md](SECURITY.md). Please follow the [code of conduct](CODE_OF_CONDUCT.md).
