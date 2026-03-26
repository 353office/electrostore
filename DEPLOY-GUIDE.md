# Deploy guide: GitHub + Cloudflare Pages + Render + Aiven PostgreSQL

## 1) Create the GitHub repository

On GitHub:
1. Click **New repository**
2. Name it something like `electrostore`
3. Create it as an empty repo

Then in your local folder:

```bash
git init
git add .
git commit -m "Initial ElectroStore app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/electrostore.git
git push -u origin main
```

## 2) Set up PostgreSQL on Aiven

1. Create a new **PostgreSQL** service in Aiven
2. Copy the connection string
3. Open Aiven's SQL console
4. Paste and run `database/init_postgres.sql`

That will create:
- converted staff/customer/product/order tables
- views/functions adapted for PostgreSQL
- app auth tables
- cart tables
- seed data

## 3) Deploy backend on Render

1. In Render, create a **Web Service**
2. Connect your GitHub repo
3. Set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Environment variables on Render

```env
DATABASE_URL=your_aiven_postgres_connection_string
PORT=3001
PGSSL_REJECT_UNAUTHORIZED=false
CORS_ORIGIN=https://your-cloudflare-pages-domain.pages.dev
SESSION_SECRET=change-me
```

### Important SSL note for Aiven
Aiven PostgreSQL often needs SSL enabled. This project already supports it. If Render shows certificate-chain issues, keep:

```env
PGSSL_REJECT_UNAUTHORIZED=false
```

## 4) Deploy frontend on Cloudflare Pages

1. In Cloudflare Pages, create a new project from the same GitHub repo
2. Set:
   - **Framework preset**: None
   - **Root directory**: `frontend`
   - **Build command**: leave empty
   - **Build output directory**: `/`

3. In `frontend/js/config.js`, set the production API URL:

```js
window.APP_CONFIG = {
  API_BASE_URL: "https://your-render-service.onrender.com/api"
};
```

You can also keep the local fallback already included.

## 5) Update CORS after first frontend deploy

After Cloudflare gives you the final Pages URL:
1. Copy that URL
2. Put it into Render as `CORS_ORIGIN`
3. Redeploy the backend

## 6) How the app works in production

- **Cloudflare Pages** serves the static frontend
- **Render** runs the Node.js API server
- **Aiven** hosts PostgreSQL

## Suggested next improvements

- password reset
- image uploads for products
- payment provider integration
- order cancellation/refunds
- audit logging
- role-based admin permissions
- inventory transfers between warehouses
