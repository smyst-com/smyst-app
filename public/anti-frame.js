// Clickjacking-Schutz (28.09.2026): GitHub Pages kann keine X-Frame-Options/
// frame-ancestors-Header setzen; dieses Skript verhindert das Einbetten der
// App in fremde Frames. Unsichtbar, ohne Design-Auswirkung.
(function () {
  if (window.top !== window.self) {
    try {
      window.top.location = window.self.location
    } catch (e) {
      // Framing komplett blocken, wenn die Navigation verweigert wird
      document.body.innerHTML = ''
      document.documentElement.style.display = 'none'
    }
  }
})()
