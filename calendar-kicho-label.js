function stripCalendarKichoLabels(root = document) {
  root.querySelectorAll(".day-kicho").forEach((node) => {
    const text = node.textContent || "";
    const next = text.replace(/^吉方位\s*/, "");
    if (text !== next) {
      node.textContent = next;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  stripCalendarKichoLabels();

  const calendarGrid = document.getElementById("calendarGrid");
  const target = calendarGrid || document.body;
  if (!target) return;

  const observer = new MutationObserver(() => {
    stripCalendarKichoLabels(target);
  });

  observer.observe(target, {
    childList: true,
    subtree: true
  });
});
