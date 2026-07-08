// 植愈 · Vercel Serverless Function
// 邮件代理：调 EmailJS HTTP API，密钥在服务端
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if(req.method === 'OPTIONS'){ return res.status(200).end(); }
    if(req.method !== 'POST'){
        return res.status(405).json({ error: 'Method Not Allowed, use POST' });
    }
    try{
        const body = req.body || {};
        const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY;
        const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID;
        const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID;
        if(!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID){
            return res.status(500).json({ error: 'EmailJS 环境变量未配置' });
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
        return res.status(resp.status).json(data);
    }catch(e){
        return res.status(500).json({ error: '邮件代理错误', detail: e.message });
    }
}
