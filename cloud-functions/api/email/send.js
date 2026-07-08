// 植愈 · EdgeOne Cloud Function (Node.js)
// 邮件代理：调 EmailJS HTTP API，密钥在服务端环境变量
export default async function onRequest(context) {
    const { request } = context;
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
        const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
        const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
        const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
        if(!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID){
            return new Response(JSON.stringify({ error: 'EmailJS 环境变量未配置' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
            });
        }
        const controller = new AbortController();
        const timer = setTimeout(()=>controller.abort(), 15000);
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
            }),
            signal: controller.signal
        });
        clearTimeout(timer);
        const text = await resp.text();
        let data;
        try{ data = JSON.parse(text); }catch(e){ data = { raw: text }; }
        return new Response(JSON.stringify(data), {
            status: resp.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }catch(e){
        return new Response(JSON.stringify({ error: '邮件代理错误', detail: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
    }
}
