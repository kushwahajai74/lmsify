# CourseHub — Frontend (FE-1)

Vite 6 + React 19 + TypeScript (strict) + Tailwind v4 + shadcn/ui.
Scaffold only — no features yet.

## Run

```bash
cd client
npm install
npm run dev
```

Opens on http://localhost:5173. Backend should be on http://localhost:4000.

## Talks to the backend at

`http://localhost:4000/api/v1` — set in `src/api/client.ts` for now
(overridden by `VITE_API_URL` in FE-2+). The backend's `FRONTEND_URL`
must match the browser origin (default `http://localhost:5173`) so CORS
+ the httpOnly cookie work.

## Scripts

- `npm run dev` — Vite dev server with HMR.
- `npm run build` — typecheck + Vite production build.
- `npm run preview` — serve the production build locally.
- `npm run typecheck` — `tsc -b --noEmit` only.
- `npm run lint` / `lint:fix` — ESLint.
- `npm run format` — Prettier (with Tailwind class sort).

## Adding shadcn components

```bash
npx shadcn@latest add <name>     # e.g. `npx shadcn@latest add input`
```

Components land in `src/components/ui/`. `components.json` is pre-configured
(zinc base, new-york style, lucide icons, no Tailwind config file — Tailwind
v4 is configured in `src/index.css`).

## What is NOT in FE-1

- Login / register UI (FE-2)
- Course browse + detail pages (FE-2)
- Admin dashboard / course / user pages (FE-3)
- Payment flow + Razorpay Checkout (FE-4)
- Tests, CI, deploy config (later phase)

Plumbing is in place: `useAuthStore`, 401 → /auth/refresh → retry interceptor,
TanStack Query, React Router 7 (data-router mode). Next phase plugs feature
pages into the router and writes real query hooks.
