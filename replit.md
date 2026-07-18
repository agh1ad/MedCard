# MedCard

MedCard turns user-researched medical information into a single landscape A4 visual-memory card without rewriting the medical content.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENAI_API_KEY` — restricted OpenAI project API key
- Optional env: `OPENAI_MODEL` — defaults to the low-cost `gpt-5-nano`
- Optional env: `OPENAI_SERVICE_TIER` — defaults to lower-cost Flex processing

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/medcard/src/components/card/MemoryCardCanvas.tsx` — landscape A4 visual-memory renderer
- `artifacts/medcard/src/pages/Generate.tsx` — source, image upload, generation, and review workflow
- `artifacts/api-server/src/lib/card-organizer.ts` — immutable source ledger and low-cost AI organization
- `lib/db/src/schema/cards.ts` — card, source-block, section-tree, and image persistence
- `lib/api-spec/openapi.yaml` — API source of truth

## Architecture decisions

- Medical prose is split into immutable source blocks before AI is called.
- AI returns only block IDs, section assignments, parent relationships, order, and visual color; it has no output field for rewritten medical text.
- The server rejects AI output if any source block is missing, duplicated, or invented.
- Images are kept out of the AI request to reduce cost and preserve privacy; users place them on the card after generation.
- Generation uses one Flex-tier request with minimal reasoning, low verbosity, one choice, and a capped output budget.
- Saved cards retain the source ledger so fidelity remains auditable.

## Product

- Paste bulk medical research and organize it into a causal pathophysiology tree.
- Keep high-yield notes, risk factors, associations, diagnosis, treatment, and complications visible as side mini-trees.
- Upload and position clinical images on the same landscape A4 card.
- Edit any tree, print one A4 landscape page, copy as text, tag, search, and save cards.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/db run push` after changing the database schema.
- Run API codegen after editing `lib/api-spec/openapi.yaml`.
- The repository excludes non-Linux native build packages for Replit; local macOS production builds require the matching optional esbuild, Rollup, and Lightning CSS binaries.
- Uploaded images are stored as data URLs in PostgreSQL; the API request limit is 20 MB per card.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
