(function () {
  "use strict";

  var cfg = window.GPTW_CONFIG || {};
  var G = window.GPTW || {};

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  var menuBtn = document.getElementById("menu-btn");
  var navLinks = document.getElementById("nav-links");
  if (menuBtn && navLinks) {
    menuBtn.addEventListener("click", function () {
      var open = navLinks.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function bookingMessage(data) {
    return (
      "Hi Clarke, I'd like the free 15-minute Who Owes You Money This Week audit.\n\n" +
      "Name: " + data.name + "\n" +
      "Business: " + data.business + "\n" +
      "WhatsApp: " + data.whatsapp + "\n" +
      "Suburb: " + (data.area || "—") + "\n" +
      "Notes: " + (data.note || "—")
    );
  }

  function readForm() {
    return {
      name: (document.getElementById("audit-name").value || "").trim(),
      business: (document.getElementById("audit-business").value || "").trim(),
      whatsapp: (document.getElementById("audit-whatsapp").value || "").trim(),
      area: (document.getElementById("audit-area").value || "").trim(),
      note: (document.getElementById("audit-note").value || "").trim()
    };
  }

  function validate(data) {
    if (!data.name || !data.business || !data.whatsapp) {
      return "Please add your name, business and WhatsApp number.";
    }
    return "";
  }

  function showSuccess(text) {
    var el = document.getElementById("audit-success");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
  }

  function copyText(text) {
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

  var form = document.getElementById("audit-form");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var data = readForm();
      var error = validate(data);
      if (error) {
        showSuccess(error);
        return;
      }
      var message = bookingMessage(data);
      try {
        localStorage.setItem("gptw-audit-request", JSON.stringify({
          at: new Date().toISOString(),
          data: data
        }));
      } catch (err) {
        /* storage may be blocked; the message can still be copied or sent */
      }
      var bizWa = cfg.whatsapp && G.toWaNumber ? G.toWaNumber(cfg.whatsapp) : "";
      if (bizWa && G.waLink) {
        window.open(G.waLink(bizWa, message), "_blank", "noopener");
        showSuccess("WhatsApp is opening with your audit request. If it didn't, copy the booking message instead.");
      } else {
        copyText(message).then(function () {
          showSuccess("Request saved on this device and the booking message was copied. Paste it to Clarke on WhatsApp. To make the button open WhatsApp directly, add his number in js/config.js.");
        }).catch(function () {
          showSuccess("Request saved on this device. Use Copy the booking message, then paste it to Clarke on WhatsApp.");
        });
      }
    });
  }

  var copyBtn = document.getElementById("audit-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", function () {
      var data = readForm();
      var error = validate(data);
      if (error) {
        showSuccess(error);
        return;
      }
      copyText(bookingMessage(data)).then(function () {
        showSuccess("Booking message copied. Paste it into WhatsApp or email.");
      }).catch(function () {
        showSuccess("Couldn't copy automatically. Select and copy the message after submitting.");
      });
    });
  }
})();
