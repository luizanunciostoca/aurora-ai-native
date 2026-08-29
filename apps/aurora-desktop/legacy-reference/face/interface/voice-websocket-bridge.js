/**
 * voice-websocket-bridge.js - Ponte EventBus entre Interface e AuroraVoiceEngine
 */

import eventBus from "../../system/core/AuroraEventBus.js";

class VoiceWebSocketBridge {
  constructor(auroraInterface) {
    this.auroraInterface = auroraInterface;
    this.isConnected = true; // Sempre true para EventBus local
    this.setupEventBusHandlers();
    this.setupIpcHandlers();
    console.log("🌉 Ponte de voz usando AuroraEventBus ativa!");
  }

  setupEventBusHandlers() {
    eventBus.on("voice:welcome", (message) => this.handleVoiceMessage(message));
    eventBus.on("voice-wake-word", (message) => this.handleVoiceMessage(message));
    eventBus.on("voice-command", (message) => this.handleVoiceMessage(message));
    eventBus.on("conversation-response", (message) => this.handleVoiceMessage(message));
    eventBus.on("voice-error", (message) => this.handleVoiceMessage(message));
    if (this.auroraInterface.mainWindow) {
      this.auroraInterface.mainWindow.webContents.send("voice-status-changed", {
        status: "connected",
        message: "Sistema de voz conectado via EventBus",
      });
    }
  }

  handleVoiceMessage(message) {
    if (!this.auroraInterface.mainWindow) return;
    if (message.type) {
      switch (message.type) {
        case "welcome":
          this.auroraInterface.mainWindow.webContents.send("voice-welcome", message);
          break;
        case "wake_word_detected":
          this.auroraInterface.mainWindow.webContents.send("voice-wake-word", message);
          break;
        case "command_received":
          this.auroraInterface.mainWindow.webContents.send("voice-command", message);
          break;
        case "response":
          this.auroraInterface.mainWindow.webContents.send("conversation-response", message);
          break;
        case "error":
          this.auroraInterface.mainWindow.webContents.send("voice-error", message);
          break;
        default:
          this.auroraInterface.mainWindow.webContents.send("voice-unknown", message);
          break;
      }
    } else {
      this.auroraInterface.mainWindow.webContents.send("voice-unknown", message);
    }
  }

  async setupIpcHandlers() {
    // IPC handlers já estão configurados em main.js
  }

  sendCommand(command) {
    eventBus.emit("voice:command", { command });
  }

  async startListening() {
    eventBus.emit("voice:start-listening");
    return true;
  }

  async stopListening() {
    eventBus.emit("voice:stop-listening");
    return true;
  }

  shutdown() {
    eventBus.removeAllListeners("voice:welcome");
    eventBus.removeAllListeners("voice-wake-word");
    eventBus.removeAllListeners("voice-command");
    eventBus.removeAllListeners("conversation-response");
    eventBus.removeAllListeners("voice-error");
  }
}

export default VoiceWebSocketBridge;
