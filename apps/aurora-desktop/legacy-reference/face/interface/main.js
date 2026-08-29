import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import VoiceWebSocketBridge from "./voice-websocket-bridge.js";
import eventBus from "../../system/core/AuroraEventBus.js";

const isDev =
  process.env.NODE_ENV === "development" ||
  process.env.AURORA_DEVTOOLS === "1" ||
  process.env.AURORA_HOTRELOAD === "1";
if (isDev) {
  try {
    require("electron-reload")(__dirname, {
      electron: require(`${__dirname}/../../node_modules/electron`),
    });
    console.log("[Aurora] Hot-reload ativado para Electron.");
  } catch (e) {
    try {
      require("./electron-reload-stub.js")();
    } catch {}
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AuroraInterface {
  constructor() {
    this.mainWindow = null;
    this.isReady = false;
    this.voiceBridge = null;
  }

  createMainWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, "..", "preload", "preload.js"),
        devTools: isDev,
      },
      frame: false,
      transparent: true,
      resizable: true,
      show: false,
    });

    this.mainWindow.loadFile(path.join(__dirname, "html", "index.html"));

    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow.show();
      this.mainWindow.focus();
      console.log("✅ Interface Aurora aberta com sucesso!");
    });

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    if (isDev) {
      this.mainWindow.webContents.openDevTools();
    }

    if (isDev) {
      const template = [
        {
          label: "Developer",
          submenu: [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
          ],
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    }
  }

  setupBasicIPC() {
    ipcMain.handle("get-system-info", () => ({
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      aurora: { version: "2.0", status: "Interface funcionando!" },
    }));

    ipcMain.handle("dashboard-command", (event, command) => {
      eventBus.emit("dashboard:command", command);
      return { success: true };
    });

    ipcMain.handle("dashboard-status", async () =>
      eventBus.request("dashboard:get-status", {})
    );

    ipcMain.handle("dashboard-module", async (event, moduleName) =>
      eventBus.request("dashboard:get-module-status", { moduleName })
    );

    ipcMain.handle("dashboard-error", (event, errorInfo) => {
      eventBus.emit("dashboard:error", errorInfo);
      return { success: true };
    });

    eventBus.on("dashboard:status", (status) => {
      if (this.mainWindow) this.mainWindow.webContents.send("dashboard-status", status);
    });
    eventBus.on("dashboard:log", (log) => {
      if (this.mainWindow) this.mainWindow.webContents.send("dashboard-log", log);
    });
    eventBus.on("dashboard:module", (moduleInfo) => {
      if (this.mainWindow) this.mainWindow.webContents.send("dashboard-module", moduleInfo);
    });
    eventBus.on("dashboard:error", (error) => {
      if (this.mainWindow) this.mainWindow.webContents.send("dashboard-error", error);
    });

    ipcMain.handle("voice-send-command", async (event, command) => {
      console.log("🎤 Comando de voz recebido:", command);
      if (this.voiceBridge && this.voiceBridge.isConnected) {
        this.voiceBridge.sendCommand(command);
      } else {
        eventBus.emit("voice:command", { command });
      }
      return { success: true, command };
    });

    ipcMain.handle("voice-get-status", () => ({
      status: this.voiceBridge
        ? this.voiceBridge.isConnected
          ? "connected"
          : "disconnected"
        : "disconnected",
      listening: this.voiceBridge ? this.voiceBridge.isListening : false,
      voiceEngine: "AuroraVoiceEngine",
    }));

    ipcMain.handle("voice-start-continuous", async () => {
      if (this.voiceBridge && this.voiceBridge.isConnected) {
        await this.voiceBridge.startListening();
        return { success: true, message: "Escuta contínua iniciada" };
      }
      return { success: false, message: "Sistema de voz não conectado" };
    });

    ipcMain.handle("voice-stop-continuous", async () => {
      if (this.voiceBridge && this.voiceBridge.isConnected) {
        await this.voiceBridge.stopListening();
        return { success: true, message: "Escuta contínua parada" };
      }
      return { success: false, message: "Sistema de voz não conectado" };
    });

    ipcMain.handle("voice-test-system", () => {
      const connected = this.voiceBridge && this.voiceBridge.isConnected;
      return {
        success: connected,
        message: connected
          ? "Sistema de voz funcionando!"
          : "Sistema de voz desconectado",
      };
    });

    ipcMain.handle("manus-send-data", async (event, data) => ({ success: true, data }));
    ipcMain.handle("manus-get-status", () => ({
      status: "connected",
      initialized: true,
      version: "1.0",
    }));

    ipcMain.handle("window-minimize", () => {
      if (this.mainWindow) this.mainWindow.minimize();
    });
    ipcMain.handle("window-close", () => {
      if (this.mainWindow) this.mainWindow.close();
    });
  }

  async run() {
    try {
      console.log("🚀 Iniciando Aurora Interface (Versão Simplificada)...");
      this.createMainWindow();
      this.setupBasicIPC();
      this.voiceBridge = new VoiceWebSocketBridge(this);
      this.isReady = true;
      console.log("✅ Aurora Interface pronta!");
    } catch (error) {
      console.error("❌ Erro ao executar Aurora Interface:", error);
      app.quit();
    }
  }
}

const auroraInterface = new AuroraInterface();

if (isDev && !process.argv.includes("--remote-debugging-port=9222")) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

app.whenReady().then(async () => {
  try {
    await auroraInterface.run();
  } catch (error) {
    console.error("❌ Erro fatal na inicialização:", error);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (auroraInterface.voiceBridge) auroraInterface.voiceBridge.shutdown();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) auroraInterface.createMainWindow();
});

export default auroraInterface;
