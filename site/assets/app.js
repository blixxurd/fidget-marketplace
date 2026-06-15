// Progressive enhancement: copy-to-clipboard, live search, category filter.
// The site is fully usable without JS; this only adds interactivity.

(() => {
  // --- Click-to-copy command boxes ---
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest(".cmd-copy");
    if (!btn) return;
    e.preventDefault();
    const text = btn.getAttribute("data-copy") || "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      ta.remove();
    }
    const label = btn.querySelector(".cmd-copy-text");
    const prev = label?.textContent;
    btn.classList.add("copied");
    if (label) label.textContent = "Copied";
    clearTimeout(btn._t);
    btn._t = setTimeout(() => {
      btn.classList.remove("copied");
      if (label) label.textContent = prev;
    }, 1600);
  });

  // --- Category filtering (landing page only) ---
  const grid = document.getElementById("grid");
  if (!grid) return;
  const cards = [...grid.querySelectorAll(".card")];
  const empty = document.getElementById("empty");
  const chips = [...document.querySelectorAll(".chip")];

  let category = "all";

  function apply() {
    let visible = 0;
    for (const card of cards) {
      const show = category === "all" || card.dataset.category === category;
      card.hidden = !show;
      if (show) visible++;
    }
    if (empty) empty.hidden = visible !== 0;
  }

  for (const chip of chips) {
    chip.addEventListener("click", () => {
      chips.forEach((c) => c.classList.toggle("is-active", c === chip));
      category = chip.dataset.filter;
      apply();
    });
  }
})();
