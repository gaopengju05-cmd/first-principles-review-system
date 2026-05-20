// LifeOS AI Journal Parser — Cloudflare Worker
// Deploy: npx wrangler deploy
// Set secret: npx wrangler secret put DEEPSEEK_API_KEY

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const model = env.DEEPSEEK_MODEL || "deepseek-v4-flash";

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
      return new Response(JSON.stringify({ status: "ok", model }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Main parse endpoint
    if (url.pathname === "/api/parse-journal" && request.method === "POST") {
      try {
        const body = await request.json();
        const {
          text,
          categories = [],
          projects = [],
          tasks = [],
          activeProjectId = null,
        } = body;

        if (!text || !text.trim()) {
          return new Response(JSON.stringify({ error: "请输入内容" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const normalizedCategories = categories.map((c) => ({
          id: String(c.id || ""),
          name: String(c.name || ""),
          kind: String(c.kind || ""),
          type: String(c.type || ""),
          isPositive: c.isPositive !== false,
        })).filter((c) => c.id && c.name);

        const normalizedProjects = projects.map((p) => ({
          id: String(p.id || ""),
          name: String(p.name || ""),
          description: String(p.description || ""),
          category: String(p.category || ""),
          status: String(p.status || "active"),
        })).filter((p) => p.id && p.name);

        const normalizedTasks = tasks.map((t) => ({
          id: String(t.id || ""),
          projectId: t.projectId ? String(t.projectId) : null,
          title: String(t.title || ""),
          completed: Boolean(t.completed),
        })).filter((t) => t.id && t.title);

        const openTasks = normalizedTasks.filter((t) => !t.completed);

        const prompt = `你是一个个人时间记录解析助手。用户会用自然语言描述他今天做了什么。

请把用户输入拆成时间记录，并把每条记录自动归到现有分类、项目和任务。

你必须只返回 JSON 数组，不要 Markdown，不要解释。每个元素必须是这个结构：

{
  "title": "具体做了什么，简短，≤18字",
  "duration": 45,
  "categoryId": "必须从可用分类 id 中选择",
  "projectId": "必须从可用项目 id 中选择，无法判断则 null",
  "taskId": "必须从开放任务 id 中选择，无法判断则 null",
  "confidence": "high" | "medium" | "low",
  "reason": "为什么这样归类，≤30字"
}

当前活跃项目 id：${activeProjectId || "无"}

可用分类 JSON：
${JSON.stringify(normalizedCategories)}

可用项目 JSON：
${JSON.stringify(normalizedProjects)}

开放任务 JSON：
${JSON.stringify(openTasks)}

规则：
- 如果用户说了时长（如"2小时""30分钟"），准确提取
- 如果没说时长，根据活动类型合理估算：学习/工作类 45分钟，运动类 60分钟，休闲类 30分钟
- categoryId 必须来自可用分类 JSON，不要编造
- projectId 必须来自可用项目 JSON，不确定则 null
- taskId 必须来自开放任务 JSON，不确定则 null
- 如果 taskId 不为 null，它必须属于同一个 projectId
- 优先匹配用户明确提到的项目/任务；其次根据项目描述、任务标题、当前活跃项目推断
- 不要新建分类、项目或任务
- confidence: high = 用户明确说了时长+分类, medium = 推断有依据, low = 猜的
- 一句话可能包含多个活动，拆成多条记录
- 如果完全无法解析，返回空数组 []`;

        const resp = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: prompt },
              { role: "user", content: text },
            ],
            temperature: 0.3,
            max_tokens: 1200,
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
        const categoriesById = new Map(normalizedCategories.map((c) => [c.id, c]));
        const categoriesByName = new Map(normalizedCategories.map((c) => [c.name, c]));
        const projectsById = new Map(normalizedProjects.map((p) => [p.id, p]));
        const projectsByName = new Map(normalizedProjects.map((p) => [p.name, p]));
        const tasksById = new Map(openTasks.map((t) => [t.id, t]));
        const tasksByName = new Map(openTasks.map((t) => [t.title, t]));
        const fallbackCategory = normalizedCategories[0] || null;

        const safeRecords = (Array.isArray(parsed) ? parsed : []).map((record) => {
          const category =
            categoriesById.get(String(record.categoryId || "")) ||
            categoriesByName.get(String(record.category || "")) ||
            fallbackCategory;
          const task =
            tasksById.get(String(record.taskId || "")) ||
            tasksByName.get(String(record.task || ""));
          let project =
            projectsById.get(String(record.projectId || "")) ||
            projectsByName.get(String(record.project || ""));
          if (task && (!project || project.id !== task.projectId)) {
            project = projectsById.get(task.projectId) || project || null;
          }
          const duration = Math.round(Number(record.duration) || 0);
          const confidence = ["high", "medium", "low"].includes(record.confidence)
            ? record.confidence
            : "low";
          return {
            title: String(record.title || "").trim().slice(0, 40),
            duration: duration > 0 ? duration : 30,
            categoryId: category?.id || null,
            category: category?.name || null,
            projectId: project?.id || null,
            taskId: task?.id || null,
            confidence,
            reason: String(record.reason || record.note || "").trim().slice(0, 60),
          };
        }).filter((record) => record.title && record.categoryId);

        return new Response(JSON.stringify({ records: safeRecords, model }), {
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
