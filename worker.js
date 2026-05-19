// LifeOS AI Journal Parser — Cloudflare Worker
// Deploy: npx wrangler deploy
// Set secret: npx wrangler secret put DEEPSEEK_API_KEY

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Main parse endpoint
    if (url.pathname === "/api/parse-journal" && request.method === "POST") {
      try {
        const body = await request.json();
        const { text, categories, projects, tasks } = body;

        if (!text || !text.trim()) {
          return new Response(JSON.stringify({ error: "请输入内容" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const catNames = (categories || []).map((c) => c.name).join("、");
        const projNames = (projects || []).map((p) => p.name).join("、");
        const openTasks = (tasks || []).filter((t) => !t.completed).map((t) => t.title).join("、");

        const prompt = `你是一个个人时间记录解析助手。用户会用自然语言描述他今天做了什么。

请解析出以下信息，以 JSON 数组返回。每个元素代表一条记录：

{
  "title": "具体做了什么（简短，≤15字）",
  "duration": 分钟数（整数，合理估算），
  "category": "分类名（从可用分类中选最匹配的）",
  "project": "关联项目名（如果可以匹配到）或 null",
  "task": "关联任务名（如果可以匹配到）或 null",
  "confidence": "high" | "medium" | "low",
  "note": "备注（可选，从原文提取的额外信息）"
}

可用分类：${catNames}
可用项目：${projNames || "无"}
开放任务：${openTasks || "无"}

规则：
- 如果用户说了时长（如"2小时""30分钟"），准确提取
- 如果没说时长，根据活动类型合理估算（学习/工作类 45分钟，运动类 60分钟，休闲类 30分钟）
- 分类必须从可用分类中选择，不要编造新分类名
- 项目如果用户提到或能推断，填入 project 字段；不确定则填 null
- confidence: high = 用户明确说了时长+分类, medium = 推断有依据, low = 猜的
- 一句话可能包含多个活动，拆成多条记录
- 只返回 JSON 数组，不要任何其他文字
- 如果完全无法解析，返回空数组 []`;

        const resp = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: text },
            ],
            temperature: 0.3,
            max_tokens: 800,
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error("DeepSeek API error:", resp.status, errText);
          return new Response(JSON.stringify({ error: "AI 服务暂时不可用，请稍后重试" }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";

        // Extract JSON array
        const match = content.match(/\[[\s\S]*\]/);
        if (!match) {
          return new Response(JSON.stringify({ error: "AI 返回格式异常，请尝试用更具体的描述" }), {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const parsed = JSON.parse(match[0]);

        return new Response(JSON.stringify({ records: parsed }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        console.error("Parse error:", err);
        return new Response(JSON.stringify({ error: "解析失败，请稍后重试" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
