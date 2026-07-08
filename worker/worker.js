/**
 * 植愈 · API 中转代理
 * 部署到 Cloudflare Worker，保护前端明文密钥
 *
 * 该 Worker 接收前端请求，在服务端补上密钥后转发到智谱 AI / EmailJS。
 * 前端代码不再含任何明文 Key，F12 看不到。
 *
 * 部署后将本文件部署到 Cloudflare Worker，把得到的地址
 * （形如 https://zhiyu-proxy.your-name.workers.dev）填到前端
 * 的 API_BASE 变量即可。
 */

// ========== 在这里填你的密钥（只有 Worker 能看到，前端拿不到）==========
const AI_API_KEY = '6c79eb5b51884d4a9661de32564482db.92iWMe9g8yak4GoY';
const EMAILJS_PUBLIC_KEY = 'zt1HYl6awhYfxCyXe';
const EMAILJS_SERVICE_ID = 'service_aao91am';
const EMAILJS_TEMPLATE_ID = 'template_4vrhi24';
// ================================================================

// 简单访问频控（防止恶意刷量）：每个 IP 每分钟最多 30 次
const RATE_LIMIT = 30;
const RATE_WINDOW = 60; // 秒

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        };
        // 处理预检请求
        if(request.method === 'OPTIONS'){
            return new Response(null, { headers: corsHeaders });
        }

        // 简易频控（基于 Cloudflare 提供的 IP）
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const cacheKey = 'rate_' + ip;
        let count = parseInt(await env.PROXY_KV?.get(cacheKey) || '0', 10);
        if(count >= RATE_LIMIT){
            return new Response(JSON.stringify({ error: '请求太频繁，请稍后再试' }), {
                status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders }
            });
        }
        try{ env.PROXY_KV?.put(cacheKey, String(count + 1), { expirationTtl: RATE_WINDOW }); }catch(e){}

        // ============ 1. AI 对话代理：/ai/chat ============
        if(url.pathname === '/ai/chat' && request.method === 'POST'){
            try{
                const body = await request.json();
                const resp = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + AI_API_KEY
                    },
                    body: JSON.stringify({
                        model: body.model || 'glm-4-flash',
                        messages: body.messages,
                        temperature: body.temperature ?? 0.85,
                        max_tokens: body.max_tokens ?? 200,
                        top_p: body.top_p ?? 0.9
                    })
                });
                const data = await resp.json();
                return new Response(JSON.stringify(data), {
                    status: resp.status,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }catch(e){
                return new Response(JSON.stringify({ error: 'AI 代理错误: ' + e.message }), {
                    status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
                });
            }
        }

        // ============ 2. EmailJS 邮件代理：/email/send ============
        if(url.pathname === '/email/send' && request.method === 'POST'){
            try{
                const body = await request.json();
                // 调用 EmailJS HTTP API（不依赖前端 SDK，密钥在服务端）
                const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
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
                });
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
        return new Response(JSON.stringify({ error: 'Not Found', path: url.pathname }), {
            status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
    }
};
