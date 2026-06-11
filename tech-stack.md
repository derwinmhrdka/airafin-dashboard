### FRONT-END (Dashboard Mobile-First)

- **Framework:** SvelteKit (SPA mode / Adapter Node)
- **Styling:** Tailwind CSS + Shadcn-Svelte
- **Design System:** Vercel/Geist Aesthetics (Dark/Light mode, clean borders, monospace numbers)
- **Charts:** LayerCake (D3-based for Svelte, lightweight)

### BACK-END (API Service)

- **Runtime:** Node.js + TypeScript
- **Framework:** Fastify (Lightweight, low memory overhead for 2GB RAM server)
- **Database ORM:** Drizzle ORM (Zero-binary, memory-efficient)
- **Security:** Static API Key/Token verification (Prepared for the external Telegram Bot repository in Phase 2)

### DATABASE & INFRASTRUCTURE

- **Database:** PostgreSQL
- **Deployment:** Docker & Docker Compose (Frontend, Backend, DB PostgreSQL)
- **Bot Strategy:** The Telegram Bot lives in a COMPLETELY SEPARATE repository/service. In Phase 1, it runs untouched and writes to Google Sheets. In Phase 2, it will communicate with this Backend via HTTP REST API.
