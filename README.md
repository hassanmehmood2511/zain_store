# Business Manager — MongoDB version

A small business management app using:
- Frontend: plain HTML, CSS and JavaScript
- Backend: Node.js and Express
- Database: MongoDB Atlas
- Authentication: single owner account configured through environment variables
- Session storage: MongoDB-backed session store

Features: client registration, product rate list, invoice creation and printing, daily/monthly cash summaries, income, expenses, recoveries, and outstanding credit.

## 1. Install prerequisites

Install Node.js LTS from https://nodejs.org. Create a MongoDB Atlas cluster at https://www.mongodb.com/atlas/database (or use a local MongoDB server).

## 2. Add MongoDB connection details

1. In MongoDB Atlas, create a database user and set a strong password.
2. Add your current IP address under Network Access. Avoid allowing access from every IP address unless you understand the risk and need it.
3. Choose Connect → Drivers and copy the connection string.
4. Copy `.env.example` to a new file named `.env`.
5. Set `MONGODB_URI`, `SESSION_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`.
6. Never commit `.env` to GitHub. `.gitignore` already excludes it.

## 3. Run the app locally

Open a terminal in the project folder and run:

```bash
npm install
npm run dev
```

Then open http://localhost:3000 in your browser and sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

## 4. Put this into your existing Git repository

If your existing repository is already cloned to your computer, copy the project files into that repository. Keep `server.js`, `package.json`, `.gitignore`, `.env.example`, `README.md`, and the `public/` folder at the repository root. Do not copy a real `.env` file into Git.

Then run:

```bash
git status
git add .
git commit -m "Add business management app with MongoDB"
git push
```

If your repository has existing code, inspect it before copying so you do not overwrite important files. If it is a new/empty repository, these files can be placed directly at the root.

## 5. Deploy for shared access

To use the same data from different computers, deploy the Node app to a Node-capable host (for example Render or Railway) and configure the environment variables in the hosting dashboard. Keep the MongoDB Atlas IP/network settings compatible with the host. Use HTTPS in production and set `NODE_ENV=production`.

Do not deploy this as static-only hosting; Express must run because it connects to MongoDB.

## Notes and limitations

- This starter app has one shared administrator login. Anyone with that login can access all business records. It does not yet have individual staff accounts/roles.
- Product prices are read from MongoDB when creating invoices, and invoice items store the applied prices so older invoices do not change if rates change later.
- A payment made when creating an invoice is automatically added to cash income. For a later payment against an existing credit invoice, this starter app currently lets you record a recovery transaction but does not update the invoice balance automatically. A dedicated payment-allocation feature is recommended before using this for full accounting.
- Before real use, test with sample data, configure backups, use strong credentials, and consider audit logs and role-based permissions.
