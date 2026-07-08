// 植愈 · EdgeOne Cloud Function (Node.js)
// AI 对话代理：转发到智谱 GLM-4-Flash，密钥在服务端环境变量
export default async function onRequest(context) {
    const { request } = context;
    // CORS
    if(request.method === 'OPTIONS'){
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }
    if(request.method !== 'POST'){
        return new Response(JSON.stringify({ error: 'Method Not Allowed, use POST' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }
    try{
        const body = await request.json();
        if(!body.messages || !Array.isArray(body.messages) || body.messages.length === 0){
            return new Response(JSON.stringify({ error: 'messages 字段缺失或非数组' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
            });
        }
        const AI_API_KEY = process.env.AI_API_KEY;
        if(!AI_API_KEY){
            return new Response(JSON.stringify({ error: 'AI_API_KEY 环境变量未配置' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
            });
        }
        const forwardBody = {
            model: body.model || 'glm-4-flash',
            messages: body.messages,
            temperature: typeof body.temperature === 'number' ? body.temperature : 0.85,
            max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 500,
            top_p: typeof body.top_p === 'number' ? body.top_p : 0.9
        };
        // 带超时的 fetch + 重试
        const doFetch = async ()=>{
            const controller = new AbortController();
            const timer = setTimeout(()=>controller.abort(), 25000);
            try{
                return await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + AI_API_KEY
                    },
                    body: JSON.stringify(forwardBody),
                    signal: controller.signal
                });
            }finally{
                clearTimeout(timer);
            }
        };
        let resp;
        try{
            resp = await doFetch();
        }catch(timeoutErr){
            console.log('AI 第一次请求失败，重试中...', timeoutErr.message);
            try{ resp = await doFetch(); }
            catch(retryErr){
                return new Response(JSON.stringify({ error: 'AI 服务连接失败（重试后仍失败）', detail: retryErr.message }), {
                    status: 502,
                    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
                });
            }
        }
        const respText = await resp.text();
        let data;
        try{ data = JSON.parse(respText); }
        catch(e){ data = { raw: respText }; }
        return new Response(JSON.stringify(data), {
            status: resp.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }catch(e){
        return new Response(JSON.stringify({ error: 'AI 代理内部错误', detail: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
