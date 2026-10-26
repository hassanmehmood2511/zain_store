const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI. Copy .env.example to .env and configure it.");
  process.exit(1);
}
if (!process.env.SESSION_SECRET || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error("Set SESSION_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD in .env.");
  process.exit(1);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(MONGODB_URI);
    }
    next();
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    next(err);
  }
});
app.use(
  session({
    name: "business_manager_session",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: MONGODB_URI,
      collectionName: "sessions",
    }),
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 8,
    },
  }),
);

const schemaOptions = { timestamps: true, strict: true };
const Client = mongoose.model("Client", new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  phone: { type: String, trim: true, maxlength: 40, default: "" },
  location: { type: String, trim: true, maxlength: 160, default: "" },
  contactPerson: { type: String, trim: true, maxlength: 120, default: "" }
}, schemaOptions));

const Product = mongoose.model("Product", new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  unitPrice: { type: Number, required: true, min: 0 },
  unitWeight: { type: String, trim: true, maxlength: 60, default: "" },
  printPrice: { type: Number, min: 0, default: 0 }
}, schemaOptions));

const InvoiceItemSchema = new mongoose.Schema({
  productId: { type: String, default: "" },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.01 },
  unitPrice: { type: Number, required: true, min: 0 },
  printPrice: { type: Number, required: true, min: 0 },
  lineTotal: { type: Number, required: true, min: 0 }
}, { _id: true });

const Invoice = mongoose.model("Invoice", new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  clientId: { type: String, default: "" },
  clientName: { type: String, required: true },
  clientPhone: { type: String, default: "" },
  clientLocation: { type: String, default: "" },
  invoiceDate: { type: String, required: true },
  items: { type: [InvoiceItemSchema], validate: v => v.length > 0 },
  total: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
  notes: { type: String, default: "", maxlength: 1000 }
}, schemaOptions));

const CashEntry = mongoose.model("CashEntry", new mongoose.Schema({
  type: { type: String, enum: ["income", "expense", "recovery"], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  entryDate: { type: String, required: true },
  category: { type: String, default: "", maxlength: 120 },
  description: { type: String, default: "", maxlength: 240 },
  invoiceId: { type: String, default: "" }
}, schemaOptions));

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);
const isText = (value, maxLength = 240) =>
  typeof value === "string" && value.trim().length <= maxLength;
const validId = (id) => mongoose.isValidObjectId(id);
const number = (value) => typeof value === "number" && Number.isFinite(value);

function requireAuth(req, res, next) {
  if (!req.session.authenticated) return res.status(401).json({ error: "Please sign in again." });
  next();
}

function cleanClient(body) {
  if (!isText(body.name, 120) || !body.name.trim()) {
    throw Object.assign(new Error("Client name is required."), { status: 400 });
  }

  const optionalFields = [
    ["phone", 40],
    ["location", 160],
    ["contactPerson", 120],
  ];

  for (const [field, maxLength] of optionalFields) {
    if (body[field] != null && !isText(body[field], maxLength)) {
      throw Object.assign(new Error("Invalid " + field + "."), { status: 400 });
    }
  }

  return {
    name: body.name.trim(),
    phone: (body.phone || "").trim(),
    location: (body.location || "").trim(),
    contactPerson: (body.contactPerson || "").trim(),
  };
}

function cleanProduct(body) {
  if (
    !isText(body.name, 120) ||
    !body.name.trim() ||
    !number(body.unitPrice) ||
    body.unitPrice < 0 ||
    (body.printPrice !== undefined &&
      (!number(body.printPrice) || body.printPrice < 0))
  ) {
    throw Object.assign(
      new Error("Enter a product name and valid non-negative prices."),
      { status: 400 },
    );
  }

  if (body.unitWeight != null && !isText(body.unitWeight, 60)) {
    throw Object.assign(new Error("Invalid unit weight."), { status: 400 });
  }

  return {
    name: body.name.trim(),
    unitPrice: body.unitPrice,
    unitWeight: (body.unitWeight || "").trim(),
    printPrice: body.printPrice || 0,
  };
}

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.post(
  "/api/login",
  asyncRoute(async (req, res) => {
    const { email, password } = req.body || {};
    const emailOK =
      typeof email === "string" &&
      email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();
    const passwordOK =
      typeof password === "string" &&
      (await bcrypt
        .compare(password, await bcrypt.hash(process.env.ADMIN_PASSWORD, 10))
        .catch(() => false));

    // Constant-time-ish password comparison is handled by bcrypt; configured password is the only admin credential.
    if (!emailOK || !passwordOK) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    req.session.authenticated = true;
    req.session.email = process.env.ADMIN_EMAIL;

    req.session.save((err) => {
      if (err) {
        console.error("Session save failed:", err);
        return res.status(500).json({
          error: "Could not save login session.",
        });
      }

      return res.json({
        ok: true,
        email: process.env.ADMIN_EMAIL,
      });
    });
  }),
);
app.get("/api/session", (req, res) =>
  req.session.authenticated
    ? res.json({ authenticated: true, email: req.session.email })
    : res.json({ authenticated: false }),
);
app.post("/api/logout", (req, res) =>
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Could not sign out." });

    res.clearCookie("business_manager_session");
    res.json({ ok: true });
  }),
);

app.use("/api", requireAuth);

// Clients
app.get(
  "/api/clients",
  asyncRoute(async (req, res) =>
    res.json(await Client.find().sort({ name: 1 }).lean()),
  ),
);
app.post(
  "/api/clients",
  asyncRoute(async (req, res) =>
    res.status(201).json(await Client.create(cleanClient(req.body))),
  ),
);
app.put(
  "/api/clients/:id",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid client ID." });
    }

    const doc = await Client.findByIdAndUpdate(
      req.params.id,
      cleanClient(req.body),
      { new: true, runValidators: true },
    );
    if (!doc) return res.status(404).json({ error: "Client not found." });

    res.json(doc);
  }),
);
app.delete(
  "/api/clients/:id",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid client ID." });
    }

    const doc = await Client.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Client not found." });

    res.json({ ok: true });
  }),
);

// Products
app.get(
  "/api/products",
  asyncRoute(async (req, res) =>
    res.json(await Product.find().sort({ name: 1 }).lean()),
  ),
);
app.post(
  "/api/products",
  asyncRoute(async (req, res) =>
    res.status(201).json(await Product.create(cleanProduct(req.body))),
  ),
);
app.put(
  "/api/products/:id",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid product ID." });
    }

    const doc = await Product.findByIdAndUpdate(
      req.params.id,
      cleanProduct(req.body),
      { new: true, runValidators: true },
    );
    if (!doc) return res.status(404).json({ error: "Product not found." });

    res.json(doc);
  }),
);
app.delete(
  "/api/products/:id",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid product ID." });
    }

    const doc = await Product.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Product not found." });

    res.json({ ok: true });
  }),
);

// Invoices; invoice items are embedded to keep this small implementation simple.
app.get(
  "/api/invoices",
  asyncRoute(async (req, res) =>
    res.json(
      await Invoice.find()
        .sort({ invoiceDate: -1, createdAt: -1 })
        .lean(),
    ),
  ),
);
app.post(
  "/api/invoices",
  asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (
      !isText(b.clientId, 80) ||
      !isText(b.invoiceDate, 10) ||
      !Array.isArray(b.items) ||
      !b.items.length
    ) {
      return res
        .status(400)
        .json({ error: "Choose a client, date and at least one product." });
    }

    const client = await Client.findById(b.clientId).lean();
    if (!client) {
      return res.status(400).json({ error: "Selected client was not found." });
    }

    const items = [];
    let total = 0;
    for (const line of b.items) {
      if (
        !validId(line.productId) ||
        !number(line.quantity) ||
        line.quantity <= 0
      ) {
        return res.status(400).json({
          error: "Each invoice line needs a product and positive quantity.",
        });
      }

      const product = await Product.findById(line.productId).lean();
      if (!product) {
        return res
          .status(400)
          .json({ error: "A selected product was not found." });
      }

      // Prices are sourced from database, not trusted from browser input.
      const lineTotal = Number(
        (line.quantity * (product.unitPrice + product.printPrice)).toFixed(2),
      );
      items.push({
        productId: String(product._id),
        productName: product.name,
        quantity: line.quantity,
        unitPrice: product.unitPrice,
        printPrice: product.printPrice,
        lineTotal,
      });
      total += lineTotal;
    }

    total = Number(total.toFixed(2));
    const amountPaid = Number(b.amountPaid || 0);
    if (!number(amountPaid) || amountPaid < 0 || amountPaid > total) {
      return res.status(400).json({
        error: "Amount paid must be between zero and invoice total.",
      });
    }

    const balance = Number((total - amountPaid).toFixed(2));
    const status =
      balance === 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid";
    const invoiceNumber =
      "INV-" +
      String(b.invoiceDate).replaceAll("-", "") +
      "-" +
      Date.now().toString().slice(-6);
    const invoice = await Invoice.create({
      invoiceNumber,
      clientId: String(client._id),
      clientName: client.name,
      clientPhone: client.phone,
      clientLocation: client.location,
      invoiceDate: b.invoiceDate,
      items,
      total,
      amountPaid,
      balance,
      status,
      notes: isText(b.notes || "", 1000) ? b.notes || "" : "",
    });

    if (amountPaid > 0) {
      await CashEntry.create({
        type: "income",
        amount: amountPaid,
        entryDate: b.invoiceDate,
        category: "Invoice " + invoiceNumber,
        description: "Initial payment received from " + client.name,
        invoiceId: String(invoice._id),
      });
    }

    res.status(201).json(invoice);
  }),
);
app.delete(
  "/api/invoices/:id",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid invoice ID." });
    }

    const doc = await Invoice.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Invoice not found." });

    await CashEntry.deleteMany({ invoiceId: String(doc._id) });
    res.json({ ok: true });
  }),
);

// Cash entries
app.get(
  "/api/cash",
  asyncRoute(async (req, res) =>
    res.json(
      await CashEntry.find()
        .sort({ entryDate: -1, createdAt: -1 })
        .lean(),
    ),
  ),
);
app.post(
  "/api/cash",
  asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (
      !["income", "expense", "recovery"].includes(b.type) ||
      !number(b.amount) ||
      b.amount <= 0 ||
      !isText(b.entryDate, 10)
    ) {
      return res
        .status(400)
        .json({ error: "Enter a valid type, amount and date." });
    }
    if (!isText(b.category || "", 120) || !isText(b.description || "", 240)) {
      return res
        .status(400)
        .json({ error: "Category or description is too long." });
    }

    res.status(201).json(
      await CashEntry.create({
        type: b.type,
        amount: b.amount,
        entryDate: b.entryDate,
        category: b.category || "",
        description: b.description || "",
      }),
    );
  }),
);
app.put(
  "/api/cash/:id",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid transaction ID." });
    }

    const b = req.body || {};
    if (
      !["income", "expense", "recovery"].includes(b.type) ||
      !number(b.amount) ||
      b.amount <= 0 ||
      !isText(b.entryDate, 10) ||
      !isText(b.category || "", 120) ||
      !isText(b.description || "", 240)
    ) {
      return res
        .status(400)
        .json({ error: "Enter valid transaction details." });
    }

    const doc = await CashEntry.findByIdAndUpdate(
      req.params.id,
      {
        type: b.type,
        amount: b.amount,
        entryDate: b.entryDate,
        category: b.category || "",
        description: b.description || "",
      },
      { new: true, runValidators: true },
    );
    if (!doc) return res.status(404).json({ error: "Transaction not found." });

    res.json(doc);
  }),
);
app.delete(
  "/api/cash/:id",
  asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) {
      return res.status(400).json({ error: "Invalid transaction ID." });
    }

    const doc = await CashEntry.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: "Transaction not found." });

    res.json({ ok: true });
  }),
);

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);

  res.status(err.status || 500).json({
    error: err.status
      ? err.message
      : "Server error. Check the server terminal for details.",
  });
});

module.exports = app;