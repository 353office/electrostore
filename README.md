# ElectroStore

ElectroStore is a starter full-stack electronics store web app built from the structure of the uploaded Node.js + HTML/CSS template and from the uploaded MySQL electronics-store schema.

It includes:

- Customer storefront
- Login/logout
- Product catalog with search and category filters
- Cart and checkout
- Order history
- Admin dashboard for products, stock, and orders
- PostgreSQL schema converted from the uploaded MySQL model
- Extra app tables added for authentication and cart support

## Folder structure

- `frontend/` static HTML/CSS/JS app
- `backend/` Express API server
- `database/init_postgres.sql` PostgreSQL schema + seed data
- `database/mysql_reference/` copies of the original uploaded SQL for reference

## Local development

### 1. Database
Create a PostgreSQL database and run:

```sql
\i database/init_postgres.sql
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit DATABASE_URL
npm start
```

### 3. Frontend

Serve `frontend/` with any static file server, or just deploy it directly on Cloudflare Pages.

For local testing:

```bash
cd frontend
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Demo accounts

- Admin: `admin@electrostore.bg` / `admin123`
- Customer: `dimitar.nikolov@email.bg` / `customer123`
- Customer: `ana.ivanova@gmail.com` / `customer123`

## Deployment

See `DEPLOY-GUIDE.md`.
