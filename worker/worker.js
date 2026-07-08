/**
 * 植愈 · API 中转代理
 * 部署到 Cloudflare Worker，保护前端明文密钥
 */

// ========== 密钥（只有 Worker 能看到，前端拿不到）==========
const AI_API_KEY = '6c79eb5b51884d4a9661de32564482db.92iWMe9g8yak4GoY';
const EMAILJS_PUBLIC_KEY = 'zt1HYl6awhYfxCyXe';
const EMAILJS_SERVICE_ID = 'service_aao91am';
const EMAILJS_TEMPLATE_ID = 'template_4vrhi24';
// ================================================================

const AI_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// 带超时的 fetch，避免智谱 API 慢时 Worker 一直挂起
function fetchWithTimeout(url, opts, timeoutMs){
    return Promise.race([
        fetch(url, opts),
        new Promise((_, reject)=>{
            setTimeout(()=>reject(new Error('请求超时（'+timeoutMs+'ms）')), timeoutMs);
        })
    ]);
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };
        if(request.method === 'OPTIONS'){
            return new Response(null, { headers: corsHeaders });
        }

        // ============ 0. 健康检查端点：GET /test ============
        // 用于快速验证 Worker 是否在线、密钥是否有效
        if(url.pathname === '/test' && request.method === 'GET'){
            try{
                const resp = await fetchWithTimeout(AI_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + AI_API_KEY
                    },
                    body: JSON.stringify({
                        model: 'glm-4-flash',
                        messages: [{ role:'user', content:'你好' }],
                        max_tokens: 20
                    })
                }, 15000);
                const data = await resp.json();
                const aiOk = !!(data.choices && data.choices[0]);
                return new Response(JSON.stringify({
                    worker: 'online',
                    ai_reachable: aiOk,
                    ai_status: resp.status,
                    ai_reply: aiOk ? data.choices[0].message.content : null,
                    error: data.error ? JSON.stringify(data.error) : null
                }, null, 2), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }catch(e){
                return new Response(JSON.stringify({
                    worker: 'online',
                    ai_reachable: false,
                    error: e.message
                }, null, 2), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }

        // ============ 1. AI 对话代理：POST /ai/chat ============
        if(url.pathname === '/ai/chat' && request.method === 'POST'){
            try{
                const body = await request.json();
                // 校验 messages 必须存在且是数组
                if(!body.messages || !Array.isArray(body.messages) || body.messages.length === 0){
                    return new Response(JSON.stringify({ error: 'messages 字段缺失或非数组' }), {
                        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }
                // 构造转发体：严格透传 messages，其余参数用前端值或默认值
                const forwardBody = {
                    model: body.model || 'glm-4-flash',
                    messages: body.messages,
                    temperature: typeof body.temperature === 'number' ? body.temperature : 0.85,
                    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 500,
                    top_p: typeof body.top_p === 'number' ? body.top_p : 0.9
                };
                // 第一次尝试，超时 25 秒
                let resp;
                try{
                    resp = await fetchWithTimeout(AI_URL, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + AI_API_KEY
                        },
                        body: JSON.stringify(forwardBody)
                    }, 25000);
                }catch(timeoutErr){
                    // 第一次超时，重试一次
                    console.log('AI 第一次请求超时，重试中...');
                    try{
                        resp = await fetchWithTimeout(AI_URL, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + AI_API_KEY
                            },
                            body: JSON.stringify(forwardBody)
                        }, 25000);
                    }catch(retryErr){
                        return new Response(JSON.stringify({
                            error: 'AI 服务连接失败（重试后仍超时）',
                            detail: retryErr.message
                        }), {
                            status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders }
                        });
                    }
                }
                // 读取响应
                const respText = await resp.text();
                // 尝试解析为 JSON，解析失败就把原文返回（智谱偶尔返回非 JSON）
                let data;
                try{ data = JSON.parse(respText); }
                catch(e){ data = { raw: respText }; }
                // 如果智谱返回错误，带上原始状态码和错误体
                if(!resp.ok){
                    return new Response(JSON.stringify({
                        error: '智谱 API 返回错误',
                        status: resp.status,
                        detail: data
                    }), {
                        status: resp.status,
                        headers: { 'Content-Type': 'application/json', ...corsHeaders }
                    });
                }
                return new Response(JSON.stringify(data), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }catch(e){
                return new Response(JSON.stringify({
                    error: 'AI 代理内部错误',
                    detail: e.message,
                    stack: e.stack
                }), {
                    status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }

        // ============ 2. EmailJS 邮件代理：POST /email/send ============
        if(url.pathname === '/email/send' && request.method === 'POST'){
            try{
                const body = await request.json();
                const resp = await fetchWithTimeout('https://api.emailjs.com/api/v1.0/email/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        service_id: EMAILJS_SERVICE_ID,
                        template_id: EMAILJS_TEMPLATE_ID,
                        user_id: EMAILJS_PUBLIC_KEY,
                        template_params: {
                            to_email: body.to_email,
                            subject: body.subject,
                            plant_name: body.plant_name,
                            message: body.message,
                            time: body.time || new Date().toLocaleString('zh-CN')
                        }
                    })
                }, 15000);
                const text = await resp.text();
                return new Response(text, {
                    status: resp.status,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }catch(e){
                return new Response(JSON.stringify({ error: '邮件代理错误: ' + e.message }), {
                    status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }

        // 未知路由
        return new Response(JSON.stringify({
            error: 'Not Found',
            path: url.pathname,
            hint: '可用端点: GET /test, POST /ai/chat, POST /email/send'
        }), {
            status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
};
