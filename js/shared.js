(function (global) {
  "use strict";

  var VAT_RATE = (global.GPTW_CONFIG && global.GPTW_CONFIG.vatRate) || 0.15;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    var s = String(value);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isoDate(value) {
    var d = toDate(value) || new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function startOfToday() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function formatDate(value) {
    var d = toDate(value);
    if (!d) return "—";
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  function formatZAR(amount) {
    var n = Number(amount);
    if (!Number.isFinite(n)) n = 0;
    var sign = n < 0 ? "-" : "";
    var parts = Math.abs(n).toFixed(2).split(".");
    var whole = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return sign + "R" + whole + "." + parts[1];
  }

  function parseMoney(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    var s = String(value || "").replace(/[R\s,]/gi, "").replace(",", ".");
    var n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function roundMoney(n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }

  function lineAmount(item) {
    var qty = Number(item && item.qty);
    var price = Number(item && item.unitPrice);
    if (!Number.isFinite(qty)) qty = 0;
    if (!Number.isFinite(price)) price = 0;
    return roundMoney(qty * price);
  }

  function invoiceTotals(invoice) {
    var items = (invoice && invoice.lineItems) || [];
    var subtotal = roundMoney(items.reduce(function (sum, item) {
      return sum + lineAmount(item);
    }, 0));
    var includeVat = !!(invoice && invoice.includeVat);
    var vat = includeVat ? roundMoney(subtotal * VAT_RATE) : 0;
    return {
      subtotal: subtotal,
      vat: vat,
      total: roundMoney(subtotal + vat)
    };
  }

  function invoiceStatus(invoice, today) {
    if (!invoice) return "unpaid";
    if (invoice.status === "paid" || invoice.paidAt) return "paid";
    var due = toDate(invoice.dueDate);
    var now = today ? toDate(today) : startOfToday();
    if (due && due < now) return "overdue";
    return "unpaid";
  }

  function statusLabel(status) {
    if (status === "paid") return "Paid";
    if (status === "overdue") return "Overdue";
    return "Unpaid";
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function toWaNumber(raw) {
    var d = digitsOnly(raw);
    if (!d) return "";
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("27") && d.length >= 11) return d;
    if (d.length === 10 && d.startsWith("0")) return "27" + d.slice(1);
    if (d.length === 9) return "27" + d;
    return d;
  }

  function prettyPhone(raw) {
    var intl = toWaNumber(raw);
    if (intl.startsWith("27") && intl.length === 11) {
      return "0" + intl.slice(2, 4) + " " + intl.slice(4, 7) + " " + intl.slice(7);
    }
    return String(raw || "").trim() || "—";
  }

  function waLink(number, text) {
    var n = toWaNumber(number);
    if (!n) return "";
    var url = "https://wa.me/" + n;
    if (text) url += "?text=" + encodeURIComponent(text);
    return url;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function csvEscape(value) {
    var s = String(value == null ? "" : value);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function uid(prefix) {
    return (prefix || "id") + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function paymentDetails(settings) {
    var s = settings || {};
    var lines = [];
    if (s.payshapId) lines.push("PayShap: " + s.payshapId);
    if (s.bankName || s.accountNumber) {
      lines.push(
        "EFT: " +
          [s.bankName, s.accountName, s.accountType, s.accountNumber, s.branchCode ? "Branch " + s.branchCode : ""]
            .filter(Boolean)
            .join(" · ")
      );
    }
    return lines.join("\n");
  }

  function reminderTemplates(invoice, settings, kind) {
    var totals = invoiceTotals(invoice);
    var amount = formatZAR(totals.total);
    var name = (invoice && invoice.clientName) || "there";
    var number = (invoice && invoice.number) || "your invoice";
    var due = formatDate(invoice && invoice.dueDate);
    var biz = (settings && (settings.businessName || settings.tradingAs)) || "us";
    var pay = paymentDetails(settings);
    var payLine = pay ? "\n\n" + pay : "";
    var firm = kind === "firm";

    var enPolite =
      "Hi " + name + ", I hope you're well.\n\n" +
      "Just a friendly reminder that invoice " + number + " for " + amount +
      " was due on " + due + ". I'd be grateful if you could settle it this week when you have a moment." +
      payLine +
      "\n\nThank you so much,\n" + biz;

    var enFirm =
      "Hi " + name + ",\n\n" +
      "Invoice " + number + " for " + amount + " is now overdue (due " + due +
      "). Please arrange payment today so we can close this off." +
      payLine +
      "\n\nKind regards,\n" + biz;

    var afPolite =
      "Hallo " + name + ", ek hoop dit gaan goed.\n\n" +
      "Net 'n vriendelike herinnering dat faktuur " + number + " van " + amount +
      " op " + due + " betaalbaar was. Ons sal dit baie waardeer as jy dit hierdie week kan vereffen." +
      payLine +
      "\n\nBaie dankie,\n" + biz;

    var afFirm =
      "Hallo " + name + ",\n\n" +
      "Faktuur " + number + " van " + amount + " is nou agterstallig (betaalbaar " + due +
      "). Besteel asseblief vandag betaling sodat ons dit kan afsluit." +
      payLine +
      "\n\nVriendelike groete,\n" + biz;

    var enRequest =
      "Hi " + name + ", I hope you're well.\n\n" +
      "Please find invoice " + number + " for " + amount + ", due " + due +
      ". You can pay by PayShap or EFT using the details below. Let me know once it's done and I'll mark it as paid." +
      payLine +
      "\n\nThank you,\n" + biz;

    var afRequest =
      "Hallo " + name + ", ek hoop dit gaan goed.\n\n" +
      "Hier is faktuur " + number + " vir " + amount + ", betaalbaar " + due +
      ". Jy kan via PayShap of EFT betaal met die besonderhede hier onder. Laat weet gerus as dit betaal is." +
      payLine +
      "\n\nDankie,\n" + biz;

    return {
      enRequest: enRequest,
      afRequest: afRequest,
      enPolite: firm ? enFirm : enPolite,
      enFirm: enFirm,
      afPolite: firm ? afFirm : afPolite,
      afFirm: afFirm
    };
  }

  global.GPTW = {
    VAT_RATE: VAT_RATE,
    pad: pad,
    toDate: toDate,
    isoDate: isoDate,
    startOfToday: startOfToday,
    formatDate: formatDate,
    formatZAR: formatZAR,
    parseMoney: parseMoney,
    roundMoney: roundMoney,
    lineAmount: lineAmount,
    invoiceTotals: invoiceTotals,
    invoiceStatus: invoiceStatus,
    statusLabel: statusLabel,
    digitsOnly: digitsOnly,
    toWaNumber: toWaNumber,
    prettyPhone: prettyPhone,
    waLink: waLink,
    escapeHtml: escapeHtml,
    csvEscape: csvEscape,
    uid: uid,
    paymentDetails: paymentDetails,
    reminderTemplates: reminderTemplates
  };
})(window);
