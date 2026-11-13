# Vendored Lucide icons

Source: `lucide-static` v1.72.0 (`icons/*.svg`), copied unmodified. License: ISC, see `LICENSE`.

Only the geometry is used at runtime: `../parse.ts` keeps basic shapes and their
geometric attributes and drops everything else.

To add one: copy the SVG here, map an item type to it in `../index.ts` (`ICON_FOR_TYPE`).
Tests fail if a library type has no icon or a vendored icon is unused.
