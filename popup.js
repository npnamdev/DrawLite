document.getElementById("toggleExtension").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "toggleExtension" });
  window.close();
});
