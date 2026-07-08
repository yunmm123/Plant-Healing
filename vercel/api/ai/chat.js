// 植愈 · Vercel Serverless Function
// AI 对话代理：转发到智谱 GLM-4-Flash，密钥在服务端
export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if(req.method === 'OPTIONS'){ return res.status(200).end(); }
    if(req.method !== 'POST'){
        return res.status(405).json({ error: 'Method Not Allowed, use POST' });
    }
    try{
        const body = req.body || {};
        if(!body.messages || !Array.isArray(body.messages) || body.messages.length === 0){
            return res.status(400).json({ error: 'messages 字段缺失或非数组' });
        }
        const AI_API_KEY = process.env.AI_API_KEY;
        if(!AI_API_KEY){
            return res.status(500).json({ error: 'AI_API_KEY 环境变量未配置' });
        }
        const forwardBody = {
            model: body.model || 'glm-4-flash',
            messages: body.messages,
            temperature: typeof body.temperature === 'number' ? body.temperature : 0.85,
            max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 500,
            top_p: typeof body.top_p === 'number' ? body.top_p : 0.9
        };
        // 带超时的 fetch
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(), 25000);
        let resp;
        try{
            resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + AI_API_KEY
                },
                body: JSON.stringify(forwardBody),
                signal: controller.signal
            });
        }catch(timeoutErr){
            // 重试一次
            console.log('AI 第一次请求超时，重试中...');
            const c2 = new AbortController();
            const t2 = setTimeout(()=>c2.abort(), 25000);
            try{
                resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + AI_API_KEY
                    },
                    body: JSON.stringify(forwardBody),
                    signal: c2.signal
                });
            }catch(retryErr){
                clearTimeout(t2);
                return res.status(502).json({ error: 'AI 服务连接失败（重试后仍超时）', detail: retryErr.message });
            }
            clearTimeout(t2);
        }
        clearTimeout(timer);
        const respText = await resp.text();
        let data;
        try{ data = JSON.parse(respText); }
        catch(e){ data = { raw: respText }; }
        if(!resp.ok){
            return res.status(resp.status).json({ error: '智谱 API 返回错误', status: resp.status, detail: data });
        }
        return res.status(200).json(data);
    }catch(e){
        return res.status(500).json({ error: 'AI 代理内部错误', detail: e.message });
    }
}
