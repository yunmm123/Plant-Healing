// 植愈 · EdgeOne Cloud Function (Node.js)
// 健康检查：验证函数是否在线、密钥是否有效
export default async function onRequest(context) {
    try{
        const AI_API_KEY = process.env.AI_API_KEY;
        if(!AI_API_KEY){
            return new Response(JSON.stringify({ worker: 'online', ai_reachable: false, error: 'AI_API_KEY 未配置' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
            });
        }
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(), 15000);
        const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + AI_API_KEY
            },
            body: JSON.stringify({
                model: 'glm-4-flash',
                messages: [{ role:'user', content:'你好' }],
                max_tokens: 20
            }),
            signal: controller.signal
        });
        clearTimeout(timer);
        const data = await resp.json();
        const aiOk = !!(data.choices && data.choices[0]);
        return new Response(JSON.stringify({
            worker: 'online',
            ai_reachable: aiOk,
            ai_status: resp.status,
            ai_reply: aiOk ? data.choices[0].message.content : null,
            error: data.error ? JSON.stringify(data.error) : null
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }catch(e){
        return new Response(JSON.stringify({ worker: 'online', ai_reachable: false, error: e.message }), {
            status: 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
