(function () {
  "use strict";

  var G = window.GPTW;
  var STORAGE_KEY = "gptw-data-v1";

  var state = loadState();
  var currentFilter = "all";
  var searchTerm = "";
  var previewId = null;

  function defaultState() {
    return {
      settings: {
        businessName: "",
        tradingAs: "",
        address: "",
        email: "",
        phone: "",
        vatRegistered: false,
        vatNumber: "",
        payshapId: "",
        bankName: "",
        accountName: "",
        accountType: "",
        accountNumber: "",
        branchCode: ""
      },
      invoices: [],
      nextInvoiceSeq: 1,
      demoLoaded: false
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      var base = defaultState();
      return {
        settings: Object.assign(base.settings, parsed.settings || {}),
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
        nextInvoiceSeq: Number(parsed.nextInvoiceSeq) || 1,
        demoLoaded: !!parsed.demoLoaded
      };
    } catch (err) {
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function toast(message) {
    var el = document.getElementById("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove("show");
    }, 2600);
  }

  function nextNumber() {
    var year = new Date().getFullYear();
    var seq = state.nextInvoiceSeq || 1;
    return "GPTW-" + year + "-" + String(seq).padStart(4, "0");
  }

  function bumpSeqIfNeeded(number) {
    var m = String(number || "").match(/GPTW-\d{4}-(\d+)/i);
    if (!m) return;
    var n = parseInt(m[1], 10) + 1;
    if (n > state.nextInvoiceSeq) state.nextInvoiceSeq = n;
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function showPanel(name) {
    document.querySelectorAll(".panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.getAttribute("data-panel") === name);
    });
    document.querySelectorAll(".side-nav button[data-panel]").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-panel") === name);
    });
    if (name === "dashboard") renderDashboard();
    if (name === "settings") fillSettings();
  }

  function enrich(invoice) {
    var totals = G.invoiceTotals(invoice);
    var status = G.invoiceStatus(invoice);
    return Object.assign({}, invoice, totals, { computedStatus: status });
  }

  function monthKey(value) {
    var d = G.toDate(value);
    if (!d) return "";
    return d.getFullYear() + "-" + G.pad(d.getMonth() + 1);
  }

  function dashboardStats(invoices) {
    var now = new Date();
    var thisMonth = now.getFullYear() + "-" + G.pad(now.getMonth() + 1);
    var owed = 0;
    var overdue = 0;
    var paid = 0;
    invoices.forEach(function (inv) {
      var row = enrich(inv);
      if (row.computedStatus === "paid") {
        if (monthKey(row.paidAt || row.createdAt) === thisMonth) paid += row.total;
      } else {
        owed += row.total;
        if (row.computedStatus === "overdue") overdue += row.total;
      }
    });
    return {
      owed: G.roundMoney(owed),
      overdue: G.roundMoney(overdue),
      paid: G.roundMoney(paid)
    };
  }

  function renderDashboard() {
    var stats = dashboardStats(state.invoices);
    byId("kpi-owed").textContent = G.formatZAR(stats.owed);
    byId("kpi-overdue").textContent = G.formatZAR(stats.overdue);
    byId("kpi-paid").textContent = G.formatZAR(stats.paid);

    var demoBanner = byId("demo-banner");
    demoBanner.classList.toggle("hidden", !state.demoLoaded);

    var q = searchTerm.toLowerCase();
    var rows = state.invoices
      .map(enrich)
      .filter(function (inv) {
        if (currentFilter !== "all" && inv.computedStatus !== currentFilter) return false;
        if (!q) return true;
        return (
          String(inv.clientName || "").toLowerCase().indexOf(q) !== -1 ||
          String(inv.number || "").toLowerCase().indexOf(q) !== -1
        );
      })
      .sort(function (a, b) {
        return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
      });

    var body = byId("invoice-rows");
    var empty = byId("invoice-empty");
    body.innerHTML = rows.map(function (inv) {
      return (
        "<tr data-open=\"" + G.escapeHtml(inv.id) + "\">" +
          "<td>" + G.escapeHtml(inv.number) + "</td>" +
          "<td>" + G.escapeHtml(inv.clientName) + "</td>" +
          "<td>" + G.escapeHtml(G.formatDate(inv.createdAt)) + "</td>" +
          "<td>" + G.escapeHtml(G.formatDate(inv.dueDate)) + "</td>" +
          "<td><span class=\"pill pill-" + inv.computedStatus + "\">" + G.escapeHtml(G.statusLabel(inv.computedStatus)) + "</span></td>" +
          "<td class=\"num\">" + G.escapeHtml(G.formatZAR(inv.total)) + "</td>" +
          "<td class=\"num\"><div class=\"row-actions\">" +
            "<button type=\"button\" class=\"btn btn-sm btn-ghost\" data-open=\"" + G.escapeHtml(inv.id) + "\">View</button>" +
            (inv.computedStatus !== "paid" && inv.clientWhatsApp
              ? "<button type=\"button\" class=\"btn btn-sm btn-gold\" data-wa=\"" + G.escapeHtml(inv.id) + "\">WhatsApp</button>"
              : "") +
          "</div></td>" +
        "</tr>"
      );
    }).join("");
    empty.classList.toggle("hidden", rows.length > 0);
  }

  function emptyLine() {
    return { description: "", qty: 1, unitPrice: 0 };
  }

  function readLines() {
    return Array.prototype.map.call(document.querySelectorAll("#line-rows tr"), function (row) {
      return {
        description: row.querySelector("[data-k=description]").value.trim(),
        qty: G.parseMoney(row.querySelector("[data-k=qty]").value),
        unitPrice: G.parseMoney(row.querySelector("[data-k=unitPrice]").value)
      };
    });
  }

  function renderLines(items) {
    var list = items && items.length ? items : [emptyLine()];
    byId("line-rows").innerHTML = list.map(function (item, index) {
      var amount = G.lineAmount(item);
      return (
        "<tr>" +
          "<td><input data-k=\"description\" value=\"" + G.escapeHtml(item.description || "") + "\" placeholder=\"Labour, parts, service…\"></td>" +
          "<td><input data-k=\"qty\" type=\"number\" min=\"0\" step=\"0.01\" value=\"" + G.escapeHtml(item.qty) + "\"></td>" +
          "<td><input data-k=\"unitPrice\" type=\"number\" min=\"0\" step=\"0.01\" value=\"" + G.escapeHtml(item.unitPrice) + "\"></td>" +
          "<td class=\"num line-amt\">" + G.escapeHtml(G.formatZAR(amount)) + "</td>" +
          "<td><button type=\"button\" class=\"icon-btn\" data-remove-line=\"" + index + "\" aria-label=\"Remove line\">×</button></td>" +
        "</tr>"
      );
    }).join("");
    updateFormTotals();
  }

  function draftFromForm() {
    return {
      id: byId("invoice-id").value || G.uid("inv"),
      number: byId("inv-number").value.trim(),
      createdAt: byId("inv-date").value,
      dueDate: byId("inv-due").value,
      clientName: byId("client-name").value.trim(),
      clientWhatsApp: byId("client-wa").value.trim(),
      clientEmail: byId("client-email").value.trim(),
      includeVat: byId("inv-vat").checked,
      notes: byId("inv-notes").value.trim(),
      lineItems: readLines(),
      status: "unpaid",
      paidAt: null
    };
  }

  function updateFormTotals() {
    var totals = G.invoiceTotals({
      includeVat: byId("inv-vat").checked,
      lineItems: readLines()
    });
    byId("inv-subtotal").textContent = G.formatZAR(totals.subtotal);
    byId("inv-vat-amt").textContent = G.formatZAR(totals.vat);
    byId("inv-total").textContent = G.formatZAR(totals.total);
    document.querySelectorAll("#line-rows tr").forEach(function (row) {
      var item = {
        qty: G.parseMoney(row.querySelector("[data-k=qty]").value),
        unitPrice: G.parseMoney(row.querySelector("[data-k=unitPrice]").value)
      };
      row.querySelector(".line-amt").textContent = G.formatZAR(G.lineAmount(item));
    });
  }

  function resetInvoiceForm(existing) {
    var inv = existing || {
      id: "",
      number: nextNumber(),
      createdAt: G.isoDate(new Date()),
      dueDate: G.isoDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
      clientName: "",
      clientWhatsApp: "",
      clientEmail: "",
      includeVat: !!state.settings.vatRegistered,
      notes: "",
      lineItems: [emptyLine()]
    };
    byId("invoice-form-title").textContent = existing ? "Edit invoice " + inv.number : "New invoice";
    byId("invoice-id").value = inv.id || "";
    byId("inv-number").value = inv.number || nextNumber();
    byId("inv-date").value = G.isoDate(inv.createdAt);
    byId("inv-due").value = G.isoDate(inv.dueDate);
    byId("client-name").value = inv.clientName || "";
    byId("client-wa").value = inv.clientWhatsApp || "";
    byId("client-email").value = inv.clientEmail || "";
    byId("inv-vat").checked = !!inv.includeVat;
    byId("inv-notes").value = inv.notes || "";
    renderLines(inv.lineItems);
  }

  function saveInvoice(thenPreview) {
    var inv = draftFromForm();
    if (!inv.number || !inv.clientName) {
      toast("Add an invoice number and client name.");
      return null;
    }
    if (!inv.lineItems.some(function (item) { return item.description && item.qty && item.unitPrice; }) &&
        !inv.lineItems.some(function (item) { return G.lineAmount(item) > 0; })) {
      toast("Add at least one line item with an amount.");
      return null;
    }
    var existing = state.invoices.find(function (row) { return row.id === inv.id; });
    if (existing) {
      inv.status = existing.status;
      inv.paidAt = existing.paidAt;
      state.invoices = state.invoices.map(function (row) {
        return row.id === inv.id ? inv : row;
      });
    } else {
      if (!inv.id) inv.id = G.uid("inv");
      state.invoices.push(inv);
    }
    bumpSeqIfNeeded(inv.number);
    saveState();
    toast("Invoice " + inv.number + " saved.");
    if (thenPreview) openPreview(inv.id);
    else showPanel("dashboard");
    return inv;
  }

  function findInvoice(id) {
    return state.invoices.find(function (inv) { return inv.id === id; });
  }

  function nl(value) {
    return G.escapeHtml(value || "").replace(/\n/g, "<br>");
  }

  function renderInvoiceSheet(invoice) {
    var s = state.settings;
    var row = enrich(invoice);
    var bizName = s.businessName || s.tradingAs || "Your business";
    var docType = s.vatRegistered ? "Tax Invoice" : "Invoice";
    var lines = (invoice.lineItems || []).map(function (item) {
      return (
        "<tr>" +
          "<td>" + G.escapeHtml(item.description) + "</td>" +
          "<td class=\"num\">" + G.escapeHtml(item.qty) + "</td>" +
          "<td class=\"num\">" + G.escapeHtml(G.formatZAR(item.unitPrice)) + "</td>" +
          "<td class=\"num\">" + G.escapeHtml(G.formatZAR(G.lineAmount(item))) + "</td>" +
        "</tr>"
      );
    }).join("");
    var pay = [];
    if (s.payshapId) pay.push("<div><strong>PayShap</strong><br>" + G.escapeHtml(s.payshapId) + "</div>");
    if (s.bankName || s.accountNumber) {
      pay.push(
        "<div><strong>EFT</strong><br>" +
        [
          s.bankName,
          s.accountName,
          s.accountType,
          s.accountNumber ? "Acc " + s.accountNumber : "",
          s.branchCode ? "Branch " + s.branchCode : ""
        ].filter(Boolean).map(G.escapeHtml).join("<br>") +
        "</div>"
      );
    }

    byId("invoice-sheet").innerHTML =
      "<div class=\"inv-top\">" +
        "<div class=\"inv-brand\">" +
          "<img class=\"logo-mark\" src=\"assets/logo.svg\" alt=\"\">" +
          "<div>" +
            "<h2>" + G.escapeHtml(bizName) + "</h2>" +
            (s.tradingAs && s.tradingAs !== s.businessName ? "<div class=\"muted\">Trading as " + G.escapeHtml(s.tradingAs) + "</div>" : "") +
            "<div class=\"muted\">" + nl(s.address) + "</div>" +
            "<div class=\"muted\">" + [s.email, s.phone ? G.prettyPhone(s.phone) : ""].filter(Boolean).map(G.escapeHtml).join(" · ") + "</div>" +
            (s.vatRegistered && s.vatNumber ? "<div>VAT " + G.escapeHtml(s.vatNumber) + "</div>" : "") +
          "</div>" +
        "</div>" +
        "<div class=\"inv-meta\">" +
          "<div class=\"doc-type\">" + docType + "</div>" +
          "<div><strong>" + G.escapeHtml(invoice.number) + "</strong></div>" +
          "<div>Date: " + G.escapeHtml(G.formatDate(invoice.createdAt)) + "</div>" +
          "<div>Due: " + G.escapeHtml(G.formatDate(invoice.dueDate)) + "</div>" +
          "<div class=\"paid-stamp" + (row.computedStatus === "paid" ? " show" : "") + "\">Paid" +
            (invoice.paidAt ? " · " + G.formatDate(invoice.paidAt) : "") +
          "</div>" +
        "</div>" +
      "</div>" +
      "<div class=\"inv-grid\">" +
        "<div><h4>Bill to</h4><strong>" + G.escapeHtml(invoice.clientName) + "</strong>" +
          "<div class=\"muted\">" + (invoice.clientWhatsApp ? G.escapeHtml(G.prettyPhone(invoice.clientWhatsApp)) : "") + "</div>" +
          "<div class=\"muted\">" + G.escapeHtml(invoice.clientEmail || "") + "</div></div>" +
        "<div><h4>Amount due</h4><strong style=\"font-family:var(--font-display);font-size:1.8rem\">" +
          G.escapeHtml(G.formatZAR(row.total)) + "</strong>" +
          "<div class=\"muted\">Status: " + G.escapeHtml(G.statusLabel(row.computedStatus)) + "</div></div>" +
      "</div>" +
      "<table><thead><tr><th>Description</th><th class=\"num\">Qty</th><th class=\"num\">Unit price</th><th class=\"num\">Amount</th></tr></thead>" +
      "<tbody>" + lines + "</tbody></table>" +
      "<div class=\"totals\" style=\"margin-top:16px\">" +
        "<div><span>Subtotal</span><span>" + G.escapeHtml(G.formatZAR(row.subtotal)) + "</span></div>" +
        "<div><span>VAT" + (invoice.includeVat ? " (15%)" : "") + "</span><span>" + G.escapeHtml(G.formatZAR(row.vat)) + "</span></div>" +
        "<div class=\"grand\"><span>Total</span><span>" + G.escapeHtml(G.formatZAR(row.total)) + "</span></div>" +
      "</div>" +
      (pay.length ? "<div class=\"inv-pay\"><h4 style=\"margin:0 0 8px\">Pay by PayShap or EFT</h4><div class=\"grid-2\">" + pay.join("") + "</div></div>" : "<div class=\"inv-pay muted\">Add your PayShap and bank details in Settings so they appear here and in WhatsApp messages.</div>") +
      (invoice.notes ? "<p style=\"margin-top:18px\">" + nl(invoice.notes) + "</p>" : "") +
      "<p class=\"muted\" style=\"margin-top:24px;font-size:0.8rem\">Generated with Get Paid This Week. This document is a billing aid and not tax advice.</p>";

    var paidBtn = byId("mark-paid");
    paidBtn.textContent = row.computedStatus === "paid" ? "Mark as unpaid" : "Mark as paid";
  }

  function openPreview(id) {
    var inv = findInvoice(id);
    if (!inv) return;
    previewId = id;
    renderInvoiceSheet(inv);
    showPanel("preview");
  }

  function openWhatsApp(id, kind) {
    var inv = findInvoice(id);
    if (!inv) return;
    var templates = G.reminderTemplates(inv, state.settings, kind === "reminder-firm" ? "firm" : "polite");
    var isReminder = kind === "reminder" || kind === "reminder-firm" || G.invoiceStatus(inv) === "overdue";
    var blocks;
    if (kind === "request" || (!isReminder && kind !== "reminder")) {
      blocks = [
        { title: "Payment request — English", text: templates.enRequest },
        { title: "Payment request — Afrikaans", text: templates.afRequest }
      ];
    } else {
      blocks = [
        { title: "Polite reminder — English", text: templates.enPolite },
        { title: "Firmer reminder — English", text: templates.enFirm },
        { title: "Vriendelike herinnering — Afrikaans", text: templates.afPolite },
        { title: "Strenger herinnering — Afrikaans", text: templates.afFirm }
      ];
    }

    var missing = byId("wa-missing");
    var number = G.toWaNumber(inv.clientWhatsApp);
    missing.textContent = number
      ? "Opens WhatsApp with the message ready. You still press send — nothing goes out automatically."
      : "This client has no WhatsApp number yet. Copy a message, or add a number on the invoice and try again.";

    byId("wa-templates").innerHTML = blocks.map(function (block, index) {
      var link = number ? G.waLink(number, block.text) : "";
      return (
        "<div class=\"template-block\">" +
          "<label>" + G.escapeHtml(block.title) + "</label>" +
          "<textarea id=\"wa-text-" + index + "\" readonly>" + G.escapeHtml(block.text) + "</textarea>" +
          "<div class=\"template-actions\">" +
            "<button type=\"button\" class=\"btn btn-sm\" data-copy-wa=\"" + index + "\">Copy message</button>" +
            (link
              ? "<a class=\"btn btn-sm btn-gold\" href=\"" + G.escapeHtml(link) + "\" target=\"_blank\" rel=\"noopener\">Open WhatsApp</a>"
              : "") +
          "</div>" +
        "</div>"
      );
    }).join("");

    byId("wa-modal").classList.add("show");
  }

  function copyFrom(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    return Promise.resolve();
  }

  function fillSettings() {
    var s = state.settings;
    byId("biz-name").value = s.businessName || "";
    byId("biz-trading").value = s.tradingAs || "";
    byId("biz-address").value = s.address || "";
    byId("biz-email").value = s.email || "";
    byId("biz-phone").value = s.phone || "";
    byId("biz-vat-registered").checked = !!s.vatRegistered;
    byId("biz-vat-number").value = s.vatNumber || "";
    byId("payshap").value = s.payshapId || "";
    byId("bank-name").value = s.bankName || "";
    byId("account-name").value = s.accountName || "";
    byId("account-type").value = s.accountType || "";
    byId("account-number").value = s.accountNumber || "";
    byId("branch-code").value = s.branchCode || "";
  }

  function readSettings() {
    return {
      businessName: byId("biz-name").value.trim(),
      tradingAs: byId("biz-trading").value.trim(),
      address: byId("biz-address").value.trim(),
      email: byId("biz-email").value.trim(),
      phone: byId("biz-phone").value.trim(),
      vatRegistered: byId("biz-vat-registered").checked,
      vatNumber: byId("biz-vat-number").value.trim(),
      payshapId: byId("payshap").value.trim(),
      bankName: byId("bank-name").value.trim(),
      accountName: byId("account-name").value.trim(),
      accountType: byId("account-type").value.trim(),
      accountNumber: byId("account-number").value.trim(),
      branchCode: byId("branch-code").value.trim()
    };
  }

  function download(filename, content, type) {
    var blob = new Blob([content], { type: type || "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 500);
  }

  function exportJSON() {
    var payload = {
      exportedAt: new Date().toISOString(),
      product: "Get Paid This Week",
      settings: state.settings,
      invoices: state.invoices,
      nextInvoiceSeq: state.nextInvoiceSeq,
      demoLoaded: state.demoLoaded
    };
    download("get-paid-this-week-backup.json", JSON.stringify(payload, null, 2), "application/json");
    toast("JSON backup downloaded.");
  }

  function exportCSV() {
    var header = [
      "number", "clientName", "clientWhatsApp", "clientEmail", "createdAt", "dueDate",
      "status", "paidAt", "includeVat", "subtotal", "vat", "total", "notes", "lineItems"
    ];
    var lines = [header.join(",")];
    state.invoices.forEach(function (inv) {
      var row = enrich(inv);
      lines.push([
        inv.number, inv.clientName, inv.clientWhatsApp, inv.clientEmail,
        inv.createdAt, inv.dueDate, row.computedStatus, inv.paidAt || "",
        inv.includeVat ? "yes" : "no", row.subtotal, row.vat, row.total,
        inv.notes || "",
        (inv.lineItems || []).map(function (item) {
          return item.description + " x" + item.qty + " @" + item.unitPrice;
        }).join("; ")
      ].map(G.csvEscape).join(","));
    });
    download("get-paid-this-week-invoices.csv", lines.join("\n"), "text/csv");
    toast("CSV exported.");
  }

  function parseCSV(text) {
    var rows = [];
    var row = [];
    var cell = "";
    var inQuotes = false;
    var i;
    for (i = 0; i < text.length; i += 1) {
      var ch = text[i];
      var next = text[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') { cell += '"'; i += 1; }
        else if (ch === '"') inQuotes = false;
        else cell += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i += 1;
        row.push(cell);
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = "";
      } else cell += ch;
    }
    if (cell || row.length) {
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
    }
    return rows;
  }

  function importPayload(text, filename) {
    var name = (filename || "").toLowerCase();
    if (name.endsWith(".csv") || text.trim().indexOf("number,") === 0) {
      var rows = parseCSV(text);
      if (rows.length < 2) throw new Error("CSV had no invoice rows.");
      var header = rows[0].map(function (h) { return h.trim(); });
      var imported = rows.slice(1).map(function (cols) {
        var rec = {};
        header.forEach(function (key, idx) { rec[key] = cols[idx]; });
        return {
          id: G.uid("imp"),
          number: rec.number || nextNumber(),
          clientName: rec.clientName || "Imported client",
          clientWhatsApp: rec.clientWhatsApp || "",
          clientEmail: rec.clientEmail || "",
          createdAt: rec.createdAt || G.isoDate(new Date()),
          dueDate: rec.dueDate || rec.createdAt || G.isoDate(new Date()),
          includeVat: String(rec.includeVat || "").toLowerCase() === "yes",
          notes: rec.notes || "",
          status: rec.status === "paid" ? "paid" : "unpaid",
          paidAt: rec.paidAt || null,
          lineItems: String(rec.lineItems || "").split(";").filter(Boolean).map(function (part) {
            var m = part.trim().match(/^(.*)\s+x([\d.]+)\s+@([\d.]+)$/);
            if (m) return { description: m[1], qty: Number(m[2]), unitPrice: Number(m[3]) };
            return { description: part.trim(), qty: 1, unitPrice: G.parseMoney(rec.total) };
          })
        };
      });
      imported.forEach(function (inv) {
        bumpSeqIfNeeded(inv.number);
        state.invoices.push(inv);
      });
      saveState();
      toast("Imported " + imported.length + " invoice(s) from CSV.");
      return;
    }

    var data = JSON.parse(text);
    if (data.settings) state.settings = Object.assign(defaultState().settings, data.settings);
    if (Array.isArray(data.invoices)) {
      state.invoices = data.invoices;
    } else {
      throw new Error("JSON backup missing an invoices array.");
    }
    state.nextInvoiceSeq = Number(data.nextInvoiceSeq) || state.nextInvoiceSeq;
    state.demoLoaded = !!data.demoLoaded;
    saveState();
    fillSettings();
    toast("JSON backup restored.");
  }

  function demoSettings() {
    return {
      businessName: "Van Zyl Electrical (Demo)",
      tradingAs: "Van Zyl Electrical",
      address: "14 Voortrekker Road\nBellville\n7530",
      email: "demo@getpaidthisweek.test",
      phone: "082 000 0000",
      vatRegistered: true,
      vatNumber: "4000000000",
      payshapId: "082 000 0000",
      bankName: "Capitec Business",
      accountName: "Van Zyl Electrical Demo",
      accountType: "Business account",
      accountNumber: "1234567890",
      branchCode: "470010"
    };
  }

  function loadDemo(force, silent) {
    if (state.invoices.length && !force && !state.demoLoaded) {
      if (!window.confirm("You already have invoices. Load sample data as well?")) return;
    }
    if (force || !state.invoices.length) {
      state.settings = demoSettings();
    }
    var today = G.startOfToday();
    function days(offset) {
      var d = new Date(today);
      d.setDate(d.getDate() + offset);
      return G.isoDate(d);
    }
    var samples = [
      {
        id: "demo-oak",
        number: "GPTW-2026-0001",
        createdAt: days(-6),
        dueDate: days(7),
        clientName: "The Oak Café, Bellville",
        clientWhatsApp: "082 111 0001",
        clientEmail: "accounts@oakcafe.test",
        includeVat: true,
        notes: "DB board inspection and replacement plugs in the kitchen.",
        status: "unpaid",
        paidAt: null,
        lineItems: [
          { description: "Call-out and safety inspection", qty: 1, unitPrice: 850 },
          { description: "Labour (hours)", qty: 4, unitPrice: 650 },
          { description: "Plug points and sundries", qty: 1, unitPrice: 720 }
        ]
      },
      {
        id: "demo-vet",
        number: "GPTW-2026-0002",
        createdAt: days(-28),
        dueDate: days(-16),
        clientName: "Durbanville Veterinary Clinic",
        clientWhatsApp: "082 111 0002",
        clientEmail: "admin@durbanvillevet.test",
        includeVat: true,
        notes: "Outside lighting and backup circuit for the theatre.",
        status: "unpaid",
        paidAt: null,
        lineItems: [
          { description: "LED floodlights supplied and fitted", qty: 6, unitPrice: 980 },
          { description: "Labour and commissioning", qty: 8, unitPrice: 650 }
        ]
      },
      {
        id: "demo-parow",
        number: "GPTW-2026-0003",
        createdAt: days(-20),
        dueDate: days(-10),
        clientName: "Parow Auto Body",
        clientWhatsApp: "082 111 0003",
        clientEmail: "",
        includeVat: true,
        notes: "Workshop compressor circuit.",
        status: "paid",
        paidAt: days(-8),
        lineItems: [
          { description: "Isolator, cabling and certification", qty: 1, unitPrice: 7500 }
        ]
      },
      {
        id: "demo-lize",
        number: "GPTW-2026-0004",
        createdAt: days(-3),
        dueDate: days(5),
        clientName: "Lize Hair Studio, Durbanville",
        clientWhatsApp: "082 111 0004",
        clientEmail: "",
        includeVat: false,
        notes: "Not VAT registered work example — VAT toggle off.",
        status: "unpaid",
        paidAt: null,
        lineItems: [
          { description: "Fault finding on geyser isolator", qty: 1, unitPrice: 650 },
          { description: "Isolator replaced", qty: 1, unitPrice: 1650 }
        ]
      },
      {
        id: "demo-tyger",
        number: "GPTW-2026-0005",
        createdAt: days(-18),
        dueDate: days(-11),
        clientName: "Tyger Valley Bodyworks",
        clientWhatsApp: "082 111 0005",
        clientEmail: "books@tygervalleybodyworks.test",
        includeVat: true,
        notes: "Office air-con isolators and makeup lighting.",
        status: "unpaid",
        paidAt: null,
        lineItems: [
          { description: "Materials", qty: 1, unitPrice: 2890 },
          { description: "Labour (hours)", qty: 5, unitPrice: 650 }
        ]
      }
    ];
    var existingIds = {};
    state.invoices.forEach(function (inv) { existingIds[inv.id] = true; });
    if (force) {
      state.invoices = state.invoices.filter(function (inv) { return String(inv.id).indexOf("demo-") !== 0; });
    }
    samples.forEach(function (inv) {
      if (force || !existingIds[inv.id]) state.invoices.push(inv);
      bumpSeqIfNeeded(inv.number);
    });
    state.demoLoaded = true;
    saveState();
    fillSettings();
    renderDashboard();
    if (!silent) toast("Sample invoices loaded. Replace the demo business details in Settings before real use.");
  }

  function clearDemo() {
    state.invoices = state.invoices.filter(function (inv) { return String(inv.id).indexOf("demo-") !== 0; });
    if ((state.settings.businessName || "").indexOf("(Demo)") !== -1) {
      state.settings = defaultState().settings;
    }
    state.demoLoaded = false;
    saveState();
    fillSettings();
    renderDashboard();
    toast("Demo data cleared.");
  }

  /* Event wiring */
  document.querySelectorAll("button[data-panel], a[data-panel]").forEach(function (el) {
    el.addEventListener("click", function (event) {
      var name = el.getAttribute("data-panel");
      if (!name) return;
      event.preventDefault();
      if (name === "invoice-form" && el.id !== "edit-invoice") resetInvoiceForm();
      showPanel(name);
    });
  });

  byId("new-invoice-top").addEventListener("click", function () {
    resetInvoiceForm();
    showPanel("invoice-form");
  });

  document.querySelectorAll(".filter-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      currentFilter = btn.getAttribute("data-filter");
      document.querySelectorAll(".filter-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
      });
      renderDashboard();
    });
  });

  byId("invoice-search").addEventListener("input", function (event) {
    searchTerm = event.target.value || "";
    renderDashboard();
  });

  byId("invoice-rows").addEventListener("click", function (event) {
    var wa = event.target.closest("[data-wa]");
    if (wa) {
      event.preventDefault();
      event.stopPropagation();
      var inv = findInvoice(wa.getAttribute("data-wa"));
      openWhatsApp(wa.getAttribute("data-wa"), G.invoiceStatus(inv) === "overdue" ? "reminder" : "request");
      return;
    }
    var open = event.target.closest("[data-open]");
    if (open) openPreview(open.getAttribute("data-open"));
  });

  byId("add-line").addEventListener("click", function () {
    var items = readLines();
    items.push(emptyLine());
    renderLines(items);
  });

  byId("line-rows").addEventListener("input", updateFormTotals);
  byId("line-rows").addEventListener("click", function (event) {
    var btn = event.target.closest("[data-remove-line]");
    if (!btn) return;
    var items = readLines();
    var index = Number(btn.getAttribute("data-remove-line"));
    items.splice(index, 1);
    renderLines(items);
  });
  byId("inv-vat").addEventListener("change", updateFormTotals);

  byId("invoice-form").addEventListener("submit", function (event) {
    event.preventDefault();
    saveInvoice(false);
  });
  byId("save-and-view").addEventListener("click", function () {
    saveInvoice(true);
  });

  byId("edit-invoice").addEventListener("click", function () {
    var inv = findInvoice(previewId);
    if (!inv) return;
    resetInvoiceForm(inv);
    showPanel("invoice-form");
  });
  byId("print-invoice").addEventListener("click", function () {
    window.print();
  });
  byId("wa-request").addEventListener("click", function () {
    openWhatsApp(previewId, "request");
  });
  byId("wa-reminder").addEventListener("click", function () {
    openWhatsApp(previewId, "reminder");
  });
  byId("mark-paid").addEventListener("click", function () {
    var inv = findInvoice(previewId);
    if (!inv) return;
    if (inv.status === "paid" || inv.paidAt) {
      inv.status = "unpaid";
      inv.paidAt = null;
      toast("Marked as unpaid.");
    } else {
      inv.status = "paid";
      inv.paidAt = G.isoDate(new Date());
      toast("Marked as paid.");
    }
    saveState();
    renderInvoiceSheet(inv);
    renderDashboard();
  });

  byId("settings-form").addEventListener("submit", function (event) {
    event.preventDefault();
    state.settings = readSettings();
    saveState();
    toast("Business details saved. They will appear on invoices and WhatsApp messages.");
  });

  byId("load-demo").addEventListener("click", function () { loadDemo(true); });
  byId("clear-demo").addEventListener("click", clearDemo);
  byId("backup-btn").addEventListener("click", exportJSON);
  byId("export-json").addEventListener("click", exportJSON);
  byId("export-csv").addEventListener("click", exportCSV);
  byId("import-file").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        importPayload(String(reader.result || ""), file.name);
        renderDashboard();
        showPanel("dashboard");
      } catch (err) {
        toast("Import failed: " + (err && err.message ? err.message : "invalid file"));
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  });

  byId("wa-close").addEventListener("click", function () {
    byId("wa-modal").classList.remove("show");
  });
  byId("wa-modal").addEventListener("click", function (event) {
    if (event.target.id === "wa-modal") byId("wa-modal").classList.remove("show");
  });
  byId("wa-templates").addEventListener("click", function (event) {
    var btn = event.target.closest("[data-copy-wa]");
    if (!btn) return;
    var area = byId("wa-text-" + btn.getAttribute("data-copy-wa"));
    copyFrom(area.value).then(function () { toast("Message copied."); });
  });

  var params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1" && !state.invoices.length) loadDemo(true, true);
  if (params.get("demo") === "1" && state.demoLoaded) {
    /* already loaded */
  }

  fillSettings();
  renderDashboard();

  window.GPTW_APP = {
    getState: function () { return state; },
    dashboardStats: dashboardStats,
    loadDemo: loadDemo,
    clearDemo: clearDemo,
    saveInvoice: saveInvoice,
    exportJSON: exportJSON,
    exportCSV: exportCSV
  };
})();
