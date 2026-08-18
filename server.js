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

// =========================================================
// ROTA OAUTH INSTAGRAM (META API) - CONEXÃO SEGURA
// =========================================================

// 1. Inicia o fluxo de login
app.get("/api/instagram/auth", async (req, res) => {
    const clientId = req.query.client_id;
    
    const META_APP_ID = process.env.META_APP_ID;
    const META_USER_TOKEN = process.env.META_USER_TOKEN;
    const REDIRECT_URI = process.env.META_REDIRECT_URI || `https://${req.get('host')}/api/instagram/callback`;

    // Se o User Token gigante estiver no Vercel, ativamos o "Fast Track" sem abrir a tela do Facebook.
    if (META_USER_TOKEN) {
        return res.redirect(`${REDIRECT_URI}?code=uso_direto_token&state=${clientId}`);
    }

    if (!META_APP_ID) {
        return res.send(`<html><body style="font-family: sans-serif; text-align: center; padding: 40px; color: white; background: #0a0a0a;"><h3>Erro: Variáveis da Meta não configuradas no Vercel.</h3><p>Configure META_APP_ID, META_APP_SECRET e META_USER_TOKEN.</p></body></html>`);
    }

    // Fluxo oficial caso o META_USER_TOKEN não esteja presente
    const scope = "instagram_basic,pages_show_list,pages_read_engagement";
    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${REDIRECT_URI}&scope=${scope}&state=${clientId}`;
    
    res.redirect(authUrl);
});

// 2. Callback do Facebook após o usuário autorizar
app.get("/api/instagram/callback", async (req, res) => {
    const code = req.query.code;
    const clientId = req.query.state; 
    
    const META_APP_ID = process.env.META_APP_ID;
    const META_APP_SECRET = process.env.META_APP_SECRET;
    const META_USER_TOKEN = process.env.META_USER_TOKEN;
    const REDIRECT_URI = process.env.META_REDIRECT_URI || `https://${req.get('host')}/api/instagram/callback`;

    try {
        let userAccessToken = "";

        if (code === 'uso_direto_token' && META_USER_TOKEN) {
            userAccessToken = META_USER_TOKEN; // Usa a chave do Vercel diretamente
        } else {
            // Troca o código pelo token de acesso real do usuário
            const tokenRes = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${REDIRECT_URI}&client_secret=${META_APP_SECRET}&code=${code}`);
            const tokenData = await tokenRes.json();
            if (tokenData.error) throw new Error(tokenData.error.message);
            userAccessToken = tokenData.access_token;
        }

        // Busca as páginas do Facebook que o usuário administra
        const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`);
        const pagesData = await pagesRes.json();
        if (!pagesData.data || pagesData.data.length === 0) throw new Error("Nenhuma página de Facebook (Fanpage) vinculada foi encontrada nesta conta.");

        // Procura qual página está vinculada a um Instagram Profissional/Business
        let igAccountId = null;
        for (const page of pagesData.data) {
            const igRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${userAccessToken}`);
            const igPageData = await igRes.json();
            if (igPageData.instagram_business_account) {
                igAccountId = igPageData.instagram_business_account.id;
                break;
            }
        }
        
        if (!igAccountId) throw new Error("Nenhum Instagram Profissional está vinculado à sua página do Facebook.");

        // Busca os dados reais do perfil do Instagram
        const profileRes = await fetch(`https://graph.facebook.com/v19.0/${igAccountId}?fields=name,username,profile_picture_url,followers_count,follows_count,media_count&access_token=${userAccessToken}`);
        const igData = await profileRes.json();

        // Retorna o script que envia apenas os dados INOFENSIVOS de volta para a tela do Sistema IA.
        // O Token poderoso fica retido de forma segura e não é exposto.
        res.send(`
            <html>
                <body style="background: #0a0a0a; color: white;">
                    <h3 style="font-family: sans-serif; text-align: center; margin-top: 50px;">Conexão Bem Sucedida! Sincronizando...</h3>
                    <script>
                        window.opener.postMessage({
                            type: 'IG_OAUTH_SUCCESS',
                            clientId: '${clientId}',
                            igData: ${JSON.stringify(igData)}
                        }, '*');
                        
                        setTimeout(() => window.close(), 1000);
                    </script>
                </body>
            </html>
        `);
    } catch (error) {
        console.error("Erro no fluxo do Instagram:", error);
        res.send(`<html><body style="font-family: sans-serif; text-align: center; margin-top: 50px; background: #0a0a0a; color: #ef4444;"><h3>Falha na Conexão:</h3><p>${error.message}</p></body></html>`);
    }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Servidor a correr localmente na porta ${PORT}`);
    });
}
