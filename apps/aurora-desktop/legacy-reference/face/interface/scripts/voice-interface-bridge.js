/**
 * voice-interface-bridge.js - Ponte entre a interface HTML e o sistema de voz
 */

class VoiceInterfaceBridge {
  constructor() {
    this.ws = null;
    this.isConnected = false;
    this.isListening = false;
    this.currentState = "disconnected";
    this.conversationHistory = [];

    // Elementos da interface
    this.elements = {
      statusIndicator: null,
      listeningIndicator: null,
      statusText: null,
      responseArea: null,
      commandInput: null,
      sendBtn: null,
      clearBtn: null,
      confidenceMeter: null,
      jarvisCore: null,
    };

    // Configurações
    this.config = {
      wsUrl: "ws://localhost:8081",
      reconnectDelay: 3000,
      maxReconnectAttempts: 10,
    };

    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;

    this.initializeElements();
    this.setupEventListeners();
    this.connectToVoiceBackend();
  }

  initializeElements() {
    this.elements.statusIndicator = document.getElementById("statusIndicator");
    this.elements.listeningIndicator =
      document.getElementById("listeningIndicator");
    this.elements.statusText = document.getElementById("statusText");
    this.elements.responseArea = document.getElementById("responseArea");
    this.elements.commandInput = document.getElementById("commandInput");
    this.elements.sendBtn = document.getElementById("sendBtn");
    this.elements.clearBtn = document.getElementById("clearBtn");
    this.elements.confidenceMeter = document.getElementById("confidenceFill");
    this.elements.jarvisCore = document.getElementById("jarvisCore");

    console.log("🎮 Elementos da interface inicializados");
  }

  setupEventListeners() {
    // Comando manual
    if (this.elements.sendBtn) {
      this.elements.sendBtn.addEventListener("click", () => {
        this.sendManualCommand();
      });
    }

    if (this.elements.commandInput) {
      this.elements.commandInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          this.sendManualCommand();
        }
      });
    }

    // Limpar conversa
    if (this.elements.clearBtn) {
      this.elements.clearBtn.addEventListener("click", () => {
        this.clearConversation();
      });
    }

    // Clique no núcleo Aurora para ativar
    if (this.elements.jarvisCore) {
      this.elements.jarvisCore.addEventListener("click", () => {
        this.toggleListening();
      });
    }

    console.log("🎮 Event listeners configurados");
  }

  connectToVoiceBackend() {
    try {
      console.log("🔌 Conectando ao sistema de voz...");
      this.updateStatus("Conectando...", "connecting");

      this.ws = new WebSocket(this.config.wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.updateStatus(
          'Sistema pronto - Diga "Aurora" ou clique no núcleo',
          "connected"
        );
        console.log("✅ Conectado ao sistema de voz");

        // Iniciar modo de detecção de wake word automaticamente
        this.sendMessage({ type: "start_wake_word_detection" });
      };

      this.ws.onmessage = (event) => {
        this.handleVoiceMessage(event);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.isListening = false;
        this.updateStatus("Conexão perdida - Reconectando...", "disconnected");
        console.log("🔌 Conexão WebSocket encerrada");
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error("❌ Erro WebSocket:", error);
        this.updateStatus("Erro de conexão", "error");
      };
    } catch (error) {
      console.error("❌ Erro ao conectar:", error);
      this.updateStatus("Erro de conexão", "error");
      this.attemptReconnect();
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(
        `🔄 Tentativa de reconexão ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`
      );

      this.reconnectTimeout = setTimeout(() => {
        this.connectToVoiceBackend();
      }, this.config.reconnectDelay);
    } else {
      console.error("❌ Máximo de tentativas de reconexão atingido");
      this.updateStatus("Falha na conexão - Recarregue a página", "failed");
    }
  }

  handleVoiceMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log("📨 Mensagem recebida:", data);

      // Atualizar estado
      if (data.state) {
        this.currentState = data.state;
        this.updateInterfaceState(data.state);
      }

      // Processar tipos específicos de mensagem
      switch (data.type) {
        case "wake_word_detection_started":
          console.log("🎤 Detecção de wake word iniciada");
          this.updateStatus(
            data.message || 'Aguardando "Aurora"...',
            "wake_word_detection"
          );
          break;

        case "wake_word_detected":
          console.log("🎤 Wake word detectada!");
          this.activateListening();
          break;
      }

      // Transcrição em tempo real
      if (data.transcript) {
        this.updateTranscript(data.transcript, data.confidence);
      }

      // Resposta final
      if (data.response) {
        this.addResponseToConversation(data.response, "aurora");
      }

      // Comando reconhecido
      if (data.command) {
        this.addResponseToConversation(data.command, "user");
      }

      // Erro
      if (data.error) {
        console.error("❌ Erro do backend:", data.error);
        this.addResponseToConversation(`Erro: ${data.error}`, "error");
      }

      // Wake word detectada
      if (data.wake_word_detected) {
        console.log("🎤 Wake word detectada!");
        this.activateListening();
      }
    } catch (error) {
      console.error("❌ Erro ao processar mensagem:", error);
    }
  }

  updateInterfaceState(state) {
    const statusMessages = {
      listening: "Escutando... Fale agora",
      processing: "Processando comando...",
      speaking: "Aurora respondendo...",
      wake_word_detection: 'Aguardando "Aurora"...',
      standby: "Sistema em standby",
      error: "Erro no sistema",
    };

    const statusText = statusMessages[state] || "Estado desconhecido";
    this.updateStatus(statusText, state);

    // Atualizar animações visuais
    this.updateVisualEffects(state);
  }

  updateVisualEffects(state) {
    const { jarvisCore, listeningIndicator } = this.elements;

    if (jarvisCore) {
      jarvisCore.className = `jarvis-core ${state}`;
    }

    if (listeningIndicator) {
      if (state === "listening" || state === "wake_word_detection") {
        listeningIndicator.style.display = "flex";
      } else {
        listeningIndicator.style.display = "none";
      }
    }
  }

  updateStatus(message, status) {
    if (this.elements.statusText) {
      this.elements.statusText.textContent = message;
    }

    if (this.elements.statusIndicator) {
      this.elements.statusIndicator.className = `status-indicator ${status}`;
    }

    console.log(`📊 Status: ${message} (${status})`);
  }

  updateTranscript(text, confidence = 0) {
    // Atualizar barra de confiança
    if (this.elements.confidenceMeter) {
      this.elements.confidenceMeter.style.width = `${confidence * 100}%`;
    }

    // Mostrar transcrição em tempo real no input
    if (this.elements.commandInput && text) {
      this.elements.commandInput.value = text;
      this.elements.commandInput.style.background = "rgba(72, 219, 251, 0.2)";

      // Resetar cor após um tempo
      setTimeout(() => {
        if (this.elements.commandInput) {
          this.elements.commandInput.style.background = "";
        }
      }, 2000);
    }
  }

  addResponseToConversation(text, type = "aurora") {
    const entry = {
      id: Date.now(),
      text: text,
      type: type,
      timestamp: new Date().toLocaleTimeString(),
    };

    this.conversationHistory.push(entry);
    this.renderConversationEntry(entry);

    console.log(`💬 Adicionado à conversa [${type}]: ${text}`);
  }

  renderConversationEntry(entry) {
    if (!this.elements.responseArea) return;

    const responseItem = document.createElement("div");
    responseItem.className = `response-item ${entry.type}`;
    responseItem.innerHTML = `
      <div class="response-avatar"></div>
      <div class="response-content">
        <div class="response-label">
          ${this.getResponseLabel(entry.type)}
          <span class="response-time">${entry.timestamp}</span>
        </div>
        <div class="response-text">${entry.text}</div>
      </div>
    `;

    this.elements.responseArea.appendChild(responseItem);

    // Scroll para o final
    this.elements.responseArea.scrollTop =
      this.elements.responseArea.scrollHeight;

    // Animação de entrada
    setTimeout(() => {
      responseItem.classList.add("visible");
    }, 100);
  }

  getResponseLabel(type) {
    const labels = {
      user: "👤 Você:",
      aurora: "🤖 Aurora:",
      system: "🔧 Sistema:",
      error: "❌ Erro:",
    };

    return labels[type] || "🔹 Desconhecido:";
  }

  sendManualCommand() {
    const input = this.elements.commandInput;
    if (!input || !input.value.trim()) return;

    const command = input.value.trim();
    input.value = "";

    // Adicionar à conversa
    this.addResponseToConversation(command, "user");

    // Enviar para o backend
    this.sendMessage({
      type: "text_command",
      text: command,
    });

    console.log("📤 Comando manual enviado:", command);
  }

  toggleListening() {
    if (!this.isConnected) {
      console.warn("⚠️ Não conectado ao sistema de voz");
      return;
    }

    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startListening() {
    this.sendMessage({ type: "start_listening" });
    this.isListening = true;
    console.log("🎤 Iniciando escuta...");
  }

  stopListening() {
    this.sendMessage({ type: "stop_listening" });
    this.isListening = false;
    console.log("🛑 Parando escuta...");
  }

  activateListening() {
    // Efeito visual de ativação
    if (this.elements.jarvisCore) {
      this.elements.jarvisCore.classList.add("activated");
      setTimeout(() => {
        this.elements.jarvisCore.classList.remove("activated");
      }, 1000);
    }

    this.startListening();
  }

  clearConversation() {
    this.conversationHistory = [];

    if (this.elements.responseArea) {
      // Manter apenas a mensagem de boas-vindas
      const welcomeMessage = this.elements.responseArea.querySelector(
        ".response-item.welcome"
      );
      this.elements.responseArea.innerHTML = "";

      if (welcomeMessage) {
        this.elements.responseArea.appendChild(welcomeMessage);
      }
    }

    console.log("🗑️ Conversa limpa");
  }

  sendMessage(message) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("⚠️ WebSocket não conectado");
    }
  }

  // Método público para integração com outros sistemas
  processExternalCommand(command) {
    this.addResponseToConversation(command, "user");
    this.sendMessage({
      type: "text_command",
      text: command,
    });
  }

  // Configurar callbacks para integração com Electron
  setupElectronIntegration() {
    if (window.electronAPI) {
      console.log("🔌 Configurando integração Electron...");

      // Escutar comandos do processo principal
      window.electronAPI.onVoiceCommand((command) => {
        this.processExternalCommand(command);
      });

      // Escutar atualizações de status
      window.electronAPI.onVoiceStatusUpdate((status) => {
        this.updateInterfaceState(status.state);
      });

      // Escutar respostas
      window.electronAPI.onConversationResponse((response) => {
        this.addResponseToConversation(response.text, response.type);
      });
    }
  }
}

// Inicialização automática
let voiceBridge = null;

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 Inicializando ponte de interface de voz...");

  voiceBridge = new VoiceInterfaceBridge();

  // Configurar integração Electron se disponível
  if (window.electronAPI) {
    voiceBridge.setupElectronIntegration();
  }

  // Expor globalmente para debug
  window.voiceBridge = voiceBridge;

  console.log("✅ Ponte de interface de voz inicializada");
});

// Exportar para uso em módulos
window.VoiceInterfaceBridge = VoiceInterfaceBridge;
