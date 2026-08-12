const express = require("express");
const cors = require("cors");
const multer = require("multer");

// Configuração do Multer (guarda o ficheiro na memória para Vercel Serverless)
const upload = multer({ storage: multer.memoryStorage() });

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors({ origin: '*' }));

// ==========================================
// ROTA RAIZ
// ==========================================
app.get("/", (req, res) => {
    res.send("🚀 Servidor da A&M IA está ONLINE usando os motores de IA!");
});

// ==========================================
// ROTA CHAT BÁSICO
// ==========================================
app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Mensagem não fornecida." });

    try {
        const COHERE_API_KEY = process.env.COHERE_API_KEY;
        if (!COHERE_API_KEY) return res.status(500).json({ error: "Chave da Cohere não configurada no servidor." });

        const cohereResponse = await fetch("https://api.cohere.ai/v1/chat", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${COHERE_API_KEY}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify({ 
                model: "command-r-plus-08-2024",
                message 
            })
        });

        if (!cohereResponse.ok) {
            const errorData = await cohereResponse.text();
            console.error("Erro na API da Cohere:", errorData);
            throw new Error(`Falha na API da Cohere: ${errorData}`);
        }
        
        const data = await cohereResponse.json();
        res.json({ reply: data.text });
        
    } catch (err) {
        console.error("Erro no chat:", err);
        res.status(500).json({ error: err.message || "Falha no servidor." });
    }
});

// =========================================================
// ROTA AVANÇADA PARA O IDE (EDIÇÃO CIRÚRGICA E PROJETO)
// =========================================================
app.post("/api/ide-chat", async (req, res) => {
    const { message, systemInstruction, history } = req.body;

    if (!message) return res.status(400).json({ error: "Instrução não fornecida." });

    try {
        const COHERE_API_KEY = process.env.COHERE_API_KEY;
        if (!COHERE_API_KEY) return res.status(500).json({ error: "Chave da Cohere não configurada no servidor Vercel." });

        const coherePayload = {
            model: "command-r-plus-08-2024",
            message: message,
            preamble: systemInstruction || "Você é um assistente de IA.",
            chat_history: history || [],
            temperature: 0.1
        };

        const cohereResponse = await fetch("https://api.cohere.ai/v1/chat", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${COHERE_API_KEY}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(coherePayload)
        });

        if (!cohereResponse.ok) {
            const errorData = await cohereResponse.text();
            console.error("Erro na API da Cohere IDE:", errorData);
            return res.status(cohereResponse.status).json({ error: `Erro Cohere: ${errorData}` });
        }

        const data = await cohereResponse.json();
        res.json({ text: data.text });
        
    } catch (err) {
        console.error("Erro interno IDE:", err);
        res.status(500).json({ error: err.message || "Falha no servidor de IA." });
    }
});

// =============================
// ROTA VOZ
// =============================
app.post("/api/voice", async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "Texto não fornecido." });

    try {
        const voiceServerUrl = process.env.VOICE_SERVER_URL;
        if (!voiceServerUrl) return res.status(500).json({ error: "VOICE_SERVER_URL não configurado." });

        const voiceResponse = await fetch(`${voiceServerUrl}/clone`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: text })
        });

        if (!voiceResponse.ok) return res.status(500).json({ error: "Falha ao gerar voz." });

        const audioBuffer = await voiceResponse.arrayBuffer();
        res.setHeader("Content-Type", "audio/mpeg");
        res.send(Buffer.from(audioBuffer));
    } catch (err) {
        console.error("Erro voz:", err);
        res.status(500).json({ error: "Erro ao processar voz." });
    }
});

// =============================
// ROTA GERAÇÃO DE IMAGEM
// =============================
app.post("/api/generate-image", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt não fornecido." });

    try {
        const HF_TOKEN = process.env.HF_TOKEN;
        if (!HF_TOKEN) return res.status(500).json({ error: "Chave HF ausente." });

        const response = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0", {
            method: "POST",
            headers: { "Authorization": `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: prompt })
        });

        if (!response.ok) throw new Error("Falha na HF.");
        
        const arrayBuffer = await response.arrayBuffer();
        res.json({ predictions: [{ bytesBase64Encoded: Buffer.from(arrayBuffer).toString('base64') }] });
    } catch (err) {
        console.error("Erro gerar imagem:", err);
        res.status(500).json({ error: "Falha na geração de imagem." });
    }
});

// ===============================================
// ROTA TRANSCRIÇÃO
// ===============================================
app.post("/api/transcribe", upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Nenhum ficheiro enviado." });

    try {
        const HF_TOKEN = process.env.HF_TOKEN;
        if (!HF_TOKEN) return res.status(500).json({ error: "Chave HF ausente." });

        const response = await fetch("https://api-inference.huggingface.co/models/openai/whisper-large-v3", {
            method: "POST",
            headers: { "Authorization": `Bearer ${HF_TOKEN}`, "Content-Type": req.file.mimetype },
            body: req.file.buffer 
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            if (errData.estimated_time) return res.status(503).json({ error: `IA a iniciar. Tente em ${Math.round(errData.estimated_time)}s.`, estimated_time: errData.estimated_time });
            throw new Error(errData.error || "Falha HF.");
        }

        const data = await response.json();
        res.json({ text: data.text });
    } catch (err) {
        console.error("Erro transcrição:", err);
        res.status(500).json({ error: err.message || "Erro interno." });
    }
});

// ===============================================
// ROTA DE GERAÇÃO DE VÍDEO
// ===============================================
app.post("/api/generate-video", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt não fornecido." });

    try {
        const HF_TOKEN = process.env.HF_TOKEN;
        if (!HF_TOKEN) return res.status(500).json({ error: "Chave HF ausente." });

        const response = await fetch("https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b", {
            method: "POST",
            headers: { "Authorization": `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
            body: JSON.stringify({ inputs: prompt })
        });

        if (!response.ok) {
            const err = await response.json();
            if (err.estimated_time) return res.status(503).json({ error: `Modelo a ligar. Tente em ${Math.round(err.estimated_time)}s.` });
            throw new Error("Falha ao gerar vídeo.");
        }
        
        const arrayBuffer = await response.arrayBuffer();
        res.json({ videoBase64: Buffer.from(arrayBuffer).toString('base64') });
    } catch (err) {
        console.error("Erro gerar vídeo:", err);
        res.status(500).json({ error: "Falha na geração de vídeo." });
    }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Servidor a correr localmente na porta ${PORT}`);
    });
}
