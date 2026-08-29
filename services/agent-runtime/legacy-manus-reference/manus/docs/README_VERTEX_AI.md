# 🤖 Servidor Manus - Configuração

## ✅ Status Atual

- **Gemini AI**: ✅ Funcionando com API Key
- **Vertex AI**: ⚠️ Necessita Service Account para geração de imagens

## 🔧 Configuração do Vertex AI (Opcional)

Se você quiser usar o Vertex AI para geração de imagens:

### 1. Criar Service Account

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/)
2. Vá para **IAM & Admin** > **Service Accounts**
3. Clique em **Create Service Account**
4. Dê um nome (ex: `aurora-vertex-ai`)
5. Adicione as permissões:
   - `Vertex AI User`
   - `AI Platform User`

### 2. Baixar Chave JSON

1. Clique no Service Account criado
2. Vá para **Keys** > **Add Key** > **Create New Key**
3. Escolha **JSON**
4. Baixe o arquivo

### 3. Configurar no Projeto

1. Renomeie o arquivo baixado para `service-account-key.json`
2. Coloque na pasta `system/manus/`
3. Reinicie o servidor Manus

## 🚀 Sistema Atual

O sistema está funcionando perfeitamente com:

- **Gemini 1.5 Flash**: Para conversas e análise de texto
- **API Key**: Configuração simples e eficaz
- **Todas as funcionalidades principais**: Ativas

## 📝 Nota

Para a maioria dos casos de uso, o Gemini é suficiente. O Vertex AI é necessário apenas para geração avançada de imagens.
