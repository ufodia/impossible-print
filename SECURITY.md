# Security policy

## Sensitive boundaries

Security-sensitive areas include imported project validation, raster-header and decoded-dimension checks, memory/allocation bounds, authored-text escaping, local-file handling and generated print HTML.

Only the current `main` source is maintained at this stage. There is no promised response time or long-term support branch.

## Report privately

Use [Report a vulnerability](https://github.com/ufodia/impossible-print/security/advisories/new). Private vulnerability reporting is enabled for this repository. Do not publish exploit details or private artwork in an issue.

If that private channel is unavailable, ask the maintainer for a private route without posting sensitive details. Include the affected commit, impact, reproduction steps and a minimal synthetic project through the private channel.

## Application boundary

The studio processes images locally and does not request camera or microphone access. Generated files can still contain your artwork and measurements. Review them before distributing them. See [privacy](docs/privacy.md) for artifact contents and [reference](docs/reference.md) for supported input limits.
