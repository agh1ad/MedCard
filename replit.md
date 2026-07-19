# MedCard

MedCard turns user-researched medical information into a single landscape A4 visual-memory card. AI clarifies the source, builds the causal hierarchy, and may add visibly marked high-yield context while keeping every original block traceable.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENAI_API_KEY` — restricted OpenAI project API key
- Optional env: `OPENAI_MODEL` — defaults to the quality-first `gpt-5.6-sol`
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
- `artifacts/api-server/src/lib/card-organizer.ts` — AI editing, tree construction, provenance validation, and quality audit
- `lib/db/src/schema/cards.ts` — card, source-block, section-tree, and image persistence
- `lib/api-spec/openapi.yaml` — API source of truth

## Architecture decisions

- Medical prose is split into an immutable source ledger before AI is called.
- AI may clarify wording, split or combine ideas, and add conservative high-yield context. Every node is labeled as source, enhanced, or AI-added.
- Generation enforces compact visual-node and AI-addition budgets so cards remain memorable instead of becoming textbook outlines.
- Semantic colors are fixed: core facts pink, manifestations purple, diagnosis dark green, treatment bright green, complications red, mechanisms and supporting facts blue, and named medical concepts dark green.
- The A4 renderer balances side sections into independent columns and scales type between 11.5 and 28 px without stretched empty panels.
- The server rejects output that omits source blocks, invents source references, creates invalid parents, or contains hierarchy cycles.
- Images are kept out of the AI request to reduce cost and preserve privacy; users place them on the card after generation.
- Generation uses one Flex-tier request with medium reasoning, low verbosity, one choice, strict structured output, and a capped output budget.
- The model drafts, audits, and revises within that single call. The UI shows its coverage, hierarchy, readability, and medical-consistency scores.
- Saved cards retain the source ledger so fidelity remains auditable. AI-added nodes are visibly marked and should be reviewed before clinical use.

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
