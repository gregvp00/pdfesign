import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      // Enable this to allow 'buffer' and other node modules in the renderer if needed
      nodeIntegrationInWorker: true,
    },
  });

  // CHECK: Use !app.isPackaged to detect development mode
  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
    // Optional: Open DevTools automatically in dev mode for easier debugging
    win.webContents.openDevTools();
  } else {
    // In production, load the built file
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
