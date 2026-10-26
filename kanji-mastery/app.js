import { app } from "nitron"

app.init({
  name: "상용한자 2136",
  packageId: "com.juhyeok.kanji2136",
  version: "1.3.1",
  entry: "web/index.html",
  orientation: "portrait",
  statusBar: true,
  permissions: [],
  icon: {
    src: "web/assets/icon.svg",
    background: "#171D2E"
  }
})
