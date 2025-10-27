# Budget API Server

Lightweight Express service that exposes the budgeting data used by the React client.  
Data lives in JSON collections under `src/data`, structured with stable identifiers so it can be migrated to SQL or NoSQL stores later.

## Getting Started

```bash
cd server
npm install          # already run once, repeat if dependencies change
npm run dev          # starts nodemon on http://localhost:4000
# or
npm start            # runs the server with Node
```

The service enables CORS by default, so the React app can consume it without extra configuration.

## Available Endpoints

| Method | Path                          | Description |
|--------|------------------------------|-------------|
| GET    | `/health`                    | Basic uptime check. |
| GET    | `/api/summary`               | Dashboard metrics, quick links, and top expense groups. |
| GET    | `/api/cash-books`            | List of cash books / accounts. |
| GET    | `/api/expense-groups`        | Expense group catalog with metadata. |
| GET    | `/api/monthly-plans`         | All monthly budget plans (most recent first). |
| GET    | `/api/monthly-plans/current` | Active plan used by the UI. |
| GET    | `/api/monthly-plans/history` | Previous months’ plans. |
| GET    | `/api/expenses`              | Expense list with optional filters: `startDate`, `endDate`, `groupId`, `cashBookId`, `search`. |
| POST   | `/api/expenses`              | Append a new expense entry (updates cash-book balance and plan actuals). |
| GET    | `/api/reports/planned-vs-actual` | Dataset for charting planned vs. actual spend. |

### Adding an Expense

```json
POST /api/expenses
{
  "label": "Soccer gear",
  "amount": 42.5,
  "groupId": "grp-kids",
  "cashBookId": "cb-001",
  "date": "2024-09-05",
  "note": "New cleats for Liam",
  "tags": ["kids", "sports"],
  "planMonth": "2024-09" // optional, defaults to current plan
}
```

The API updates:

- `expenses.json` with the new record
- the corresponding `monthlyPlans.json` entry (actual spend)
- the relevant `cashBooks.json` balance and last activity

## Data Layout

- `cashBooks.json` – charts bank/cash/wallet accounts, balances, and recent activity.
- `expenseGroups.json` – normalized list of expense categories with consistent IDs.
- `monthlyPlans.json` – one document per month containing cycle dates and budgets per group.
- `expenses.json` – atomic transaction history referencing group and cash-book IDs.

Keep the JSON structure when moving to a database: primary keys (`id`) remain stable and foreign keys (`groupId`, `cashBookId`) link records across collections/tables.
