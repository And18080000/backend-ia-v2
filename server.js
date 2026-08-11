app.post("/api/generate-video", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt não fornecido." });

    try {
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
        res.status(500).json({ error: "Falha na geração de vídeo." });
    }
});

// ===============================================
// NOVA ROTA: ENGENHARIA REVERSA DE IMAGEM (VISION)
// ===============================================
app.post("/api/analyze-image", upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "Nenhuma imagem enviada." });
    }

    // Validação de formato 
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Formato não suportado. Utilize JPG, PNG ou WEBP." });
    }

    // Validação de tamanho (máximo 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (req.file.size > maxSize) {
        return res.status(400).json({ error: "A imagem excede 10MB." });
    }

    try {
        // A chave da OpenAI é necessária para o modelo GPT-4o (Vision)
        const openaiApiKey = process.env.OPENAI_API_KEY; 
        
        if (!openaiApiKey) {
            return res.status(500).json({ error: "Chave OPENAI_API_KEY não configurada na Vercel." });
        }

        // Converter buffer da memória para base64
        const base64Image = req.file.buffer.toString('base64');
        const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;

        const systemPrompt = `Você é um especialista em engenharia reversa visual e fotografia computacional.
Sua tarefa é analisar a imagem fornecida e realizar uma engenharia reversa para criar um prompt extremamente detalhado que possa ser usado em um gerador de imagens IA (como Midjourney, Stable Diffusion ou Dall-E) para recriar esta cena exata.
Analise: sujeito, pessoas, roupas, acessórios, ambiente/cenário, composição, perspectiva, ângulo da câmera, tipo de plano, iluminação (direção, intensidade, sombras), cores, textura, atmosfera, desfoque e estilo artístico.
Não invente dados. Seja descritivo e técnico.

Responda ESTRITAMENTE em formato JSON estruturado:
{
  "analysis": "Sua análise detalhada em Português sobre os elementos visuais observados.",
  "prompt": "O prompt otimizado em INGLÊS combinando: Sujeito + Ambiente + Composição + Câmera + Iluminação + Cores + Atmosfera + Estilo/Qualidade. Separe os conceitos por vírgulas.",
  "confidence": "alta/media/baixa"
}`;

        const visionResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openaiApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Faça a engenharia reversa visual gerando o prompt." },
                            { type: "image_url", image_url: { url: dataUrl, detail: "high" } }
                        ]
                    }
                ],
                max_tokens: 1500,
                response_format: { type: "json_object" }
            })
        });

        if (!visionResponse.ok) {
            const errText = await visionResponse.text();
            console.error("Erro na API da OpenAI (Vision):", errText);
            return res.status(500).json({ error: "Falha ao processar a imagem no modelo de IA." });
        }

        const data = await visionResponse.json();
        const parsedResult = JSON.parse(data.choices[0].message.content);
        
        res.json(parsedResult);

    } catch (err) {
        console.error("Erro na rota de análise de imagem:", err);
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

module.exports = app;

if (require.main === module) {
