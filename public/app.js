const $ = (id) => document.getElementById(id);
const money = (n) =>
  "Rs " +
  Number(n || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let clients = [],
  products = [],
  invoices = [],
  cashEntries = [],
  toastTimer;
function toast(msg, error = false) {
  const el = $("toast");
  el.textContent = msg;
  el.style.background = error ? "#9f2820" : "#173d2b";
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
async function api(url, options = {}) {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function nav(page) {
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  $("page-" + page).classList.remove("hidden");
  document
    .querySelectorAll(".nav-item")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("pageTitle").textContent = {
    dashboard: "Dashboard",
    clients: "Client registration",
    products: "Product rate list",
    invoices: "Invoice generator",
    cash: "Cash summary",
  }[page];
}
function showApp(email) {
  $("loginView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  $("userEmail").textContent = email;
  $("todayLabel").textContent = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
function rows(id, arr, cols) {
  $(id).innerHTML = arr.length
    ? arr.join("")
    : `<tr><td class="empty" colspan="${cols}">No records yet.</td></tr>`;
}
function actions(type, id) {
  return `<div class="actions"><button class="action-btn" data-edit="${type}" data-id="${id}">Edit</button><button class="action-btn delete" data-delete="${type}" data-id="${id}">Delete</button></div>`;
}
function renderClients() {
  const q = ($("clientSearch").value || "").toLowerCase();
  const list = clients.filter((c) =>
    [c.name, c.phone, c.location, c.contactPerson].some((v) =>
      String(v || "")
        .toLowerCase()
        .includes(q),
    ),
  );
  rows(
    "clientsTable",
    list.map(
      (c) =>
        `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.phone || "—")}</td><td>${esc(c.location || "—")}</td><td>${esc(c.contactPerson || "—")}</td><td>${actions("client", c._id)}</td></tr>`,
    ),
    5,
  );
  $("invoiceClient").innerHTML =
    '<option value="">Select client</option>' +
    clients
      .map((c) => `<option value="${c._id}">${esc(c.name)}</option>`)
      .join("");
}
function renderProducts() {
  const q = ($("productSearch").value || "").toLowerCase();
  const list = products.filter((p) =>
    [p.name, p.unitWeight].some((v) =>
      String(v || "")
        .toLowerCase()
        .includes(q),
    ),
  );
  rows(
    "productsTable",
    list.map(
      (p) =>
        `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.unitWeight || "—")}</td><td>${money(p.unitPrice)}</td><td>${money(p.printPrice)}</td><td>${actions("product", p._id)}</td></tr>`,
    ),
    5,
  );
}
function renderInvoices() {
  const q = ($("invoiceSearch").value || "").toLowerCase();
  const list = invoices.filter(
    (i) =>
      String(i.invoiceNumber).toLowerCase().includes(q) ||
      String(i.clientName).toLowerCase().includes(q),
  );
  rows(
    "invoicesTable",
    list.map(
      (i) =>
        `<tr><td><strong>${esc(i.invoiceNumber)}</strong></td><td>${esc(i.clientName)}</td><td>${esc(i.invoiceDate)}</td><td>${money(i.total)}</td><td>${money(i.amountPaid)}</td><td>${money(i.balance)}</td><td><span class="pill ${esc(i.status)}">${esc(i.status)}</span></td><td><div class="actions"><button class="action-btn" data-print="${i._id}">Print</button><button class="action-btn delete" data-delete="invoice" data-id="${i._id}">Delete</button></div></td></tr>`,
    ),
    8,
  );
  rows(
    "recentInvoices",
    invoices
      .slice(0, 5)
      .map(
        (i) =>
          `<tr><td><strong>${esc(i.invoiceNumber)}</strong></td><td>${esc(i.clientName)}</td><td>${esc(i.invoiceDate)}</td><td>${money(i.total)}</td><td>${money(i.balance)}</td><td><button class="action-btn" data-print="${i._id}">Print</button></td></tr>`,
      ),
    6,
  );
}
function renderCash() {
  const q = ($("cashSearch").value || "").toLowerCase();
  const list = cashEntries.filter((c) =>
    [c.type, c.category, c.description, c.entryDate].some((v) =>
      String(v || "")
        .toLowerCase()
        .includes(q),
    ),
  );
  rows(
    "cashTable",
    list.map(
      (c) =>
        `<tr><td>${esc(c.entryDate)}</td><td><span class="pill ${esc(c.type)}">${esc(c.type)}</span></td><td>${esc(c.category || "—")}</td><td>${esc(c.description || "—")}</td><td>${money(c.amount)}</td><td>${actions("cash", c._id)}</td></tr>`,
    ),
    6,
  );
}
function renderStats() {
  const month = today().slice(0, 7),
    day = today();
  $("statClients").textContent = clients.length;
  $("statProducts").textContent = products.length;
  $("statSales").textContent = money(
    invoices
      .filter((i) => i.invoiceDate.startsWith(month))
      .reduce((s, i) => s + i.total, 0),
  );
  $("statCredit").textContent = money(
    invoices.reduce((s, i) => s + i.balance, 0),
  );
  const sum = (types, period) =>
    cashEntries
      .filter(
        (c) =>
          types.includes(c.type) &&
          (period === "day"
            ? c.entryDate === day
            : c.entryDate.startsWith(month)),
      )
      .reduce((s, c) => s + c.amount, 0);
  $("cashDailyIncome").textContent = money(sum(["income", "recovery"], "day"));
  $("cashDailyExpense").textContent = money(sum(["expense"], "day"));
  $("cashMonthlyIncome").textContent = money(
    sum(["income", "recovery"], "month"),
  );
  $("cashMonthlyExpense").textContent = money(sum(["expense"], "month"));
  $("cashRecoveries").textContent = money(sum(["recovery"], "month"));
  $("cashCredit").textContent = money(
    invoices.reduce((s, i) => s + i.balance, 0),
  );
}
function renderAll() {
  renderClients();
  renderProducts();
  renderInvoices();
  renderCash();
  renderStats();
}
async function loadAll() {
  try {
    [clients, products, invoices, cashEntries] = await Promise.all([
      api("/api/clients"),
      api("/api/products"),
      api("/api/invoices"),
      api("/api/cash"),
    ]);
    renderAll();
  } catch (e) {
    toast(e.message, true);
  }
}
function clearClient() {
  $("clientForm").reset();
  $("clientId").value = "";
  $("clientFormTitle").textContent = "Add client";
}
function clearProduct() {
  $("productForm").reset();
  $("productId").value = "";
  $("printPrice").value = "0";
  $("productFormTitle").textContent = "Add product";
}
function resetInvoice() {
  $("invoiceForm").reset();
  $("invoiceDate").value = today();
  $("amountPaid").value = "0";
  $("invoiceLines").innerHTML = "";
  addLine();
  calcInvoice();
}
function addLine(productId = "", qty = 1) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<td><select class="line-product line-product-select" required><option value="">Select product</option>${products.map((p) => `<option value="${p._id}">${esc(p.name)}</option>`).join("")}</select></td><td><input class="line-qty" type="number" min=".01" step=".01" value="${qty}" required></td><td class="line-unit">Rs 0.00</td><td class="line-print">Rs 0.00</td><td class="line-total">Rs 0.00</td><td><button type="button" class="action-btn delete remove-line">Remove</button></td>`;
  $("invoiceLines").appendChild(tr);
  const sel = tr.querySelector("select");
  sel.value = productId;
  const update = () => {
    const p = products.find((p) => p._id === sel.value),
      q = Number(tr.querySelector(".line-qty").value) || 0;
    tr.querySelector(".line-unit").textContent = money(p?.unitPrice || 0);
    tr.querySelector(".line-print").textContent = money(p?.printPrice || 0);
    tr.querySelector(".line-total").textContent = money(
      q * ((p?.unitPrice || 0) + (p?.printPrice || 0)),
    );
    calcInvoice();
  };
  sel.addEventListener("change", update);
  tr.querySelector(".line-qty").addEventListener("input", update);
  tr.querySelector(".remove-line").addEventListener("click", () => {
    tr.remove();
    if (!$("invoiceLines").children.length) addLine();
    calcInvoice();
  });
  update();
}
function getInvoiceTotal() {
  return [...$("invoiceLines").querySelectorAll("tr")].reduce((sum, tr) => {
    const p = products.find((p) => p._id === tr.querySelector("select").value),
      q = Number(tr.querySelector(".line-qty").value) || 0;
    return sum + q * ((p?.unitPrice || 0) + (p?.printPrice || 0));
  }, 0);
}
function calcInvoice() {
  const total = getInvoiceTotal(),
    paid = Number($("amountPaid").value) || 0;
  $("invoiceSubtotal").textContent = money(total);
  $("invoicePaid").textContent = money(paid);
  $("invoiceBalance").textContent = money(Math.max(0, total - paid));
  $("invoiceStatus").value =
    paid >= total && total > 0 ? "paid" : paid > 0 ? "partial" : "unpaid";
}
async function saveClient(e) {
  e.preventDefault();
  const id = $("clientId").value;
  const body = {
    name: $("clientName").value.trim(),
    phone: $("clientPhone").value.trim(),
    location: $("clientLocation").value.trim(),
    contactPerson: $("clientContact").value.trim(),
  };
  try {
    await api(id ? "/api/clients/" + id : "/api/clients", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    clearClient();
    await loadAll();
    toast("Client saved.");
  } catch (e) {
    toast(e.message, true);
  }
}
async function saveProduct(e) {
  e.preventDefault();
  const id = $("productId").value;
  const body = {
    name: $("productName").value.trim(),
    unitPrice: Number($("unitPrice").value),
    unitWeight: $("unitWeight").value.trim(),
    printPrice: Number($("printPrice").value) || 0,
  };
  try {
    await api(id ? "/api/products/" + id : "/api/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    clearProduct();
    await loadAll();
    toast("Product saved.");
  } catch (e) {
    toast(e.message, true);
  }
}
async function saveInvoice(e) {
  e.preventDefault();
  const clientId = $("invoiceClient").value;
  const lines = [...$("invoiceLines").querySelectorAll("tr")].map((tr) => ({
    productId: tr.querySelector("select").value,
    quantity: Number(tr.querySelector(".line-qty").value),
  }));
  if (
    !clientId ||
    !lines.length ||
    lines.some((l) => !l.productId || l.quantity <= 0)
  ) {
    toast("Select a client and valid products/quantities.", true);
    return;
  }
  const total = getInvoiceTotal(),
    amountPaid = Number($("amountPaid").value) || 0;
  if (amountPaid > total) {
    toast("Amount paid cannot exceed total.", true);
    return;
  }
  try {
    const inv = await api("/api/invoices", {
      method: "POST",
      body: JSON.stringify({
        clientId,
        invoiceDate: $("invoiceDate").value,
        items: lines,
        amountPaid,
        notes: $("invoiceNotes").value.trim(),
      }),
    });
    resetInvoice();
    await loadAll();
    toast("Invoice saved.");
    printInvoice(inv);
  } catch (e) {
    toast(e.message, true);
  }
}
async function saveCash(e) {
  e.preventDefault();
  const id = $("cashForm").dataset.editId;
  const body = {
    type: $("cashType").value,
    amount: Number($("cashAmount").value),
    entryDate: $("cashDate").value,
    category: $("cashCategory").value.trim(),
    description: $("cashDescription").value.trim(),
  };
  try {
    await api(id ? "/api/cash/" + id : "/api/cash", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body),
    });
    delete $("cashForm").dataset.editId;
    $("cashForm").querySelector('[type="submit"]').textContent =
      "Save transaction";
    $("cashForm").reset();
    $("cashDate").value = today();
    await loadAll();
    toast("Transaction saved.");
  } catch (e) {
    toast(e.message, true);
  }
}
function printInvoice(inv) {
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) {
    toast("Allow pop-ups to print invoices.", true);
    return;
  }
  const items = (inv.items || [])
    .map(
      (i) =>
        `<tr><td>${esc(i.productName)}</td><td>${i.quantity}</td><td>${money(i.unitPrice)}</td><td>${money(i.printPrice)}</td><td>${money(i.lineTotal)}</td></tr>`,
    )
    .join("");
  w.document.write(
    `<!doctype html><html><head><title>${esc(inv.invoiceNumber)}</title><style>body{font:14px Arial;margin:40px;color:#222}h1{color:#176b46}table{width:100%;border-collapse:collapse;margin:25px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #ddd}th{background:#f3f7f4}.totals{margin-left:auto;width:270px}.totals p{display:flex;justify-content:space-between}@media print{body{margin:12mm}}</style></head><body><h1>INVOICE</h1><p>Business Manager</p><p><b>Invoice:</b> ${esc(inv.invoiceNumber)} &nbsp; <b>Date:</b> ${esc(inv.invoiceDate)}</p><p><b>Bill to:</b> ${esc(inv.clientName)}<br>${esc(inv.clientPhone || "")}<br>${esc(inv.clientLocation || "")}</p><table><thead><tr><th>Product</th><th>Qty</th><th>Unit price</th><th>Print price</th><th>Line total</th></tr></thead><tbody>${items}</tbody></table><div class="totals"><p><span>Total</span><b>${money(inv.total)}</b></p><p><span>Paid</span><b>${money(inv.amountPaid)}</b></p><p><span>Balance</span><b>${money(inv.balance)}</b></p></div>${inv.notes ? `<p><b>Notes:</b> ${esc(inv.notes)}</p>` : ""}<p>Thank you for your business.</p><script>window.onload=()=>window.print()<\/script></body></html>`,
  );
  w.document.close();
}
async function removeRecord(type, id) {
  if (!confirm("Delete this " + type + " record?")) return;
  const paths = {
    client: "clients",
    product: "products",
    invoice: "invoices",
    cash: "cash",
  };
  try {
    await api("/api/" + paths[type] + "/" + id, { method: "DELETE" });
    await loadAll();
    toast("Record deleted.");
  } catch (e) {
    toast(e.message, true);
  }
}
function editClient(id) {
  const c = clients.find((c) => c._id === id);
  if (!c) return;
  $("clientId").value = id;
  $("clientName").value = c.name;
  $("clientPhone").value = c.phone || "";
  $("clientLocation").value = c.location || "";
  $("clientContact").value = c.contactPerson || "";
  $("clientFormTitle").textContent = "Edit client";
  nav("clients");
}
function editProduct(id) {
  const p = products.find((p) => p._id === id);
  if (!p) return;
  $("productId").value = id;
  $("productName").value = p.name;
  $("unitPrice").value = p.unitPrice;
  $("unitWeight").value = p.unitWeight || "";
  $("printPrice").value = p.printPrice || 0;
  $("productFormTitle").textContent = "Edit product";
  nav("products");
}
function editCash(id) {
  const c = cashEntries.find((c) => c._id === id);
  if (!c) return;
  $("cashType").value = c.type;
  $("cashAmount").value = c.amount;
  $("cashDate").value = c.entryDate;
  $("cashCategory").value = c.category || "";
  $("cashDescription").value = c.description || "";
  $("cashForm").dataset.editId = id;
  $("cashForm").querySelector('[type="submit"]').textContent =
    "Update transaction";
  nav("cash");
}
function bind() {
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("loginMessage").textContent = "";
    try {
      const result = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: $("loginEmail").value,
          password: $("loginPassword").value,
        }),
      });
      showApp(result.email);
      await loadAll();
    } catch (err) {
      $("loginMessage").textContent = err.message;
    }
  });
  $("logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/logout", { method: "POST" });
      $("appView").classList.add("hidden");
      $("loginView").classList.remove("hidden");
    } catch (e) {
      toast(e.message, true);
    }
  });
  $("navigation").addEventListener("click", (e) => {
    const b = e.target.closest("[data-page]");
    if (b) nav(b.dataset.page);
  });
  document
    .querySelectorAll("[data-go]")
    .forEach((b) => b.addEventListener("click", () => nav(b.dataset.go)));
  $("clientForm").addEventListener("submit", saveClient);
  $("clientCancel").addEventListener("click", clearClient);
  $("productForm").addEventListener("submit", saveProduct);
  $("productCancel").addEventListener("click", clearProduct);
  $("invoiceForm").addEventListener("submit", saveInvoice);
  $("addInvoiceLine").addEventListener("click", () => addLine());
  $("resetInvoice").addEventListener("click", resetInvoice);
  $("amountPaid").addEventListener("input", calcInvoice);
  $("cashForm").addEventListener("submit", saveCash);
  for (const [id, fn] of [
    ["clientSearch", renderClients],
    ["productSearch", renderProducts],
    ["invoiceSearch", renderInvoices],
    ["cashSearch", renderCash],
  ])
    $(id).addEventListener("input", fn);
  document.body.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) {
      ({ client: editClient, product: editProduct, cash: editCash })[
        ed.dataset.edit
      ]?.(ed.dataset.id);
    }
    const del = e.target.closest("[data-delete]");
    if (del) removeRecord(del.dataset.delete, del.dataset.id);
    const pr = e.target.closest("[data-print]");
    if (pr) {
      const inv = invoices.find((i) => i._id === pr.dataset.print);
      if (inv) printInvoice(inv);
    }
  });
}
async function init() {
  bind();
  $("invoiceDate").value = today();
  $("cashDate").value = today();
  try {
    const s = await api("/api/session");
    if (s.authenticated) {
      showApp(s.email);
      await loadAll();
    }
  } catch (e) {
    console.error(e);
  }
}
document.addEventListener("DOMContentLoaded", init);
