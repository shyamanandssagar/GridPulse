# GridPulse — Frontend

React + Vite + Tailwind UI for the GridPulse smart-grid platform. Talks to the
GridPulse backend over REST (axios) and Socket.IO for live readings.

## Tech stack

- React 18 + Vite
- React Router v6
- Tailwind CSS (dark slate + cyan theme)
- Recharts for live charts
- axios for REST
- socket.io-client for live telemetry

## Prerequisites

- Node.js 18+
- The GridPulse backend running locally (default `http://localhost:5000`)

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

The app runs on `http://localhost:5173`. Vite's dev server proxies `/api` and
`/socket.io` to the backend, so you can leave `VITE_API_URL` and
`VITE_SOCKET_URL` blank in development.

## Project structure

```
src/
  components/   Reusable UI (Sidebar, Topbar, StatCard, charts, GoogleSignInButton, …)
  context/      AuthContext + SocketContext
  layouts/      MainLayout (sidebar + topbar + outlet)
  pages/        One file per route (Dashboard, Meters, Network, Anomalies, …)
  routes/       AppRoutes — route tree with auth guards
  services/     api.js (axios instance + endpoint helpers)
  utils/        format.js (display helpers)
  App.jsx       Top-level component (renders AppRoutes)
  main.jsx      Entry point — wires AuthProvider, SocketProvider, BrowserRouter
  index.css     Tailwind directives + custom utilities (.card, .grid-pattern, …)
```

## Auth model

Mirrors the backend exactly:

- **No public signup.** Accounts are provisioned only by an admin.
- **Email + password login** at `/login`.
- **Continue with Google** for users who already exist (requires
  `VITE_GOOGLE_CLIENT_ID`).
- **Forgot password** at `/forgot-password` → emailed OTP → `/reset-password`.

## Build

```bash
npm run build      # production bundle in dist/
npm run preview    # preview the production bundle locally
```
