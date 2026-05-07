import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import {
  Check,
  Download,
  FileDown,
  FileUp,
  Lightbulb,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import "./styles.css";

const STORAGE_KEY = "app:review-system:v1";

const PRESET_CATEGORIES = [
  { id: "cat-academic", name: "学业资产", kind: "asset", isPreset: true, color: "#69d2e7" },
  { id: "cat-english", name: "英语资产", kind: "asset", isPreset: true, color: "#a7db57" },
  { id: "cat-body", name: "身体资产", kind: "asset", isPreset: true, color: "#f6d365" },
  { id: "cat-output", name: "输出资产", kind: "asset", isPreset: true, color: "#fda085" },
  { id: "cat-survival", name: "生存任务", kind: "maintenance", isPreset: true, color: "#b8c0ff" },
  { id: "cat-attention", name: "注意力消耗", kind: "drain", isPreset: true, color: "#ff8fab" },
  { id: "cat-relation", name: "关系资产", kind: "asset", isPreset: true, color: "#8ecae6" },
  { id: "cat-finance", name: "财务资产", kind: "asset", isPreset: true, color: "#80ed99" },
];

const makeId = (prefix) => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

const localDateKey = (dateLike = new Date()) => {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const createDefaultData = () => ({
  projects: [],
  tasks: [],
  ideas: [],
  events: [],
  categories: PRESET_CATEGORIES,
  reviews: [],
  settings: {
    theme: "dark-purple",
    activeProjectId: null,
    lastOpenDate: localDateKey(),
  },
});

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const mergeCategories = (categories) => {
  const incoming = ensureArray(categories);
  const custom = incoming.filter((category) => category && !category.isPreset);
  const presetByName = new Set(PRESET_CATEGORIES.map((category) => category.name));
  const cleanedCustom = custom
    .filter((category) => category.name && !presetByName.has(category.name))
    .map((category) => ({
      id: category.id || makeId("cat"),
      name: String(category.name),
      kind: ["asset", "maintenance", "drain"].includes(category.kind) ? category.kind : "asset",
      isPreset: false,
      color: category.color || "#c4b5fd",
    }));

  return [...PRESET_CATEGORIES, ...cleanedCustom];
};

const projectProgressFromTasks = (projectId, tasks) => {
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  if (projectTasks.length === 0) return 0;
  const completed = projectTasks.filter((task) => task.completed).length;
  return Math.round((completed / projectTasks.length) * 100);
};

const normalizeData = (raw) => {
  const defaults = createDefaultData();
  if (!raw || typeof raw !== "object") return defaults;

  const tasks = ensureArray(raw.tasks).map((task) => ({
    id: task.id || makeId("task"),
    projectId: task.projectId || null,
    title: String(task.title || "未命名任务"),
    completed: Boolean(task.completed),
    createdAt: task.createdAt || nowIso(),
    completedAt: task.completed ? task.completedAt || nowIso() : null,
    fromIdeaId: task.fromIdeaId || null,
  }));

  const projects = ensureArray(raw.projects).map((project) => ({
    id: project.id || makeId("project"),
    name: String(project.name || "未命名项目"),
    description: String(project.description || ""),
    createdAt: project.createdAt || nowIso(),
    status: project.status || "active",
    category: project.category || "学业资产",
    progress: 0,
  }));

  const normalizedProjects = projects.map((project) => ({
    ...project,
    progress: projectProgressFromTasks(project.id, tasks),
  }));

  const activeProjectId = normalizedProjects.some(
    (project) => project.id === raw.settings?.activeProjectId,
  )
    ? raw.settings.activeProjectId
    : normalizedProjects[0]?.id || null;

  return {
    projects: normalizedProjects,
    tasks,
    ideas: ensureArray(raw.ideas).map((idea) => ({
      id: idea.id || makeId("idea"),
      content: String(idea.content || ""),
      createdAt: idea.createdAt || nowIso(),
      linkedProjectId: idea.linkedProjectId || null,
      status: idea.status === "converted" ? "converted" : "open",
    })),
    events: ensureArray(raw.events).map((event) => ({
      id: event.id || makeId("event"),
      title: String(event.title || "未命名事件"),
      duration: Number(event.duration) > 0 ? Number(event.duration) : 0,
      category: event.category || "学业资产",
      projectId: event.projectId || null,
      createdAt: event.createdAt || nowIso(),
    })),
    categories: mergeCategories(raw.categories),
    reviews: ensureArray(raw.reviews).map((review) => ({
      id: review.id || makeId("review"),
      date: review.date || localDateKey(review.createdAt || new Date()),
      createdAt: review.createdAt || nowIso(),
      totalMinutes: Number(review.totalMinutes) || 0,
      assetMinutes: Number(review.assetMinutes) || 0,
      drainMinutes: Number(review.drainMinutes) || 0,
      completedTaskCount: Number(review.completedTaskCount) || 0,
      ideaCount: Number(review.ideaCount) || 0,
      recommendation: String(review.recommendation || ""),
    })),
    settings: {
      ...defaults.settings,
      ...(raw.settings || {}),
      activeProjectId,
      lastOpenDate: localDateKey(),
    },
  };
};

const loadReviewData = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createDefaultData();
    return normalizeData(JSON.parse(stored));
  } catch (error) {
    console.warn("Local review data is invalid. Falling back to defaults.", error);
    return createDefaultData();
  }
};

const saveReviewData = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Failed to save review data.", error);
    return false;
  }
};

const formatMinutes = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const rest = safeMinutes % 60;
  if (hours === 0) return `${rest} 分钟`;
  if (rest === 0) return `${hours} 小时`;
  return `${hours} 小时 ${rest} 分钟`;
};

const getCategory = (categories, name) =>
  categories.find((category) => category.name === name) || PRESET_CATEGORIES[0];

const buildReview = ({ data, todayEvents, todayIdeas, todayCompletedTasks, todayKey }) => {
  const categoryMap = new Map(data.categories.map((category) => [category.name, category]));
  const totalMinutes = todayEvents.reduce((sum, event) => sum + event.duration, 0);
  const assetMinutes = todayEvents
    .filter((event) => categoryMap.get(event.category)?.kind === "asset")
    .reduce((sum, event) => sum + event.duration, 0);
  const drainMinutes = todayEvents
    .filter((event) => categoryMap.get(event.category)?.kind === "drain")
    .reduce((sum, event) => sum + event.duration, 0);
  const openTask = data.tasks.find((task) => !task.completed);
  const openIdea = data.ideas.find((idea) => idea.status !== "converted");

  let recommendation = "明天先选择一个最能增加长期资产的小动作，安排到第一段清醒时间。";
  if (assetMinutes < 60) {
    recommendation = "明天优先给高价值资产留出至少 60 分钟，不要等碎片时间自然出现。";
  } else if (drainMinutes > assetMinutes) {
    recommendation = "明天先削减一个注意力消耗入口，把省下来的时间转给输出或学业资产。";
  } else if (openTask) {
    recommendation = `明天先推进「${openTask.title}」，用一个可完成的小任务保持项目向前。`;
  } else if (openIdea) {
    recommendation = "明天从想法池选一条转成任务，让灵感进入可执行系统。";
  }

  return {
    id: makeId("review"),
    date: todayKey,
    createdAt: nowIso(),
    totalMinutes,
    assetMinutes,
    drainMinutes,
    completedTaskCount: todayCompletedTasks.length,
    ideaCount: todayIdeas.length,
    recommendation,
  };
};

function App() {
  const [data, setData] = useState(loadReviewData);
  const [storageMessage, setStorageMessage] = useState("");
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    category: PRESET_CATEGORIES[0].name,
  });
  const [taskTitle, setTaskTitle] = useState("");
  const [ideaForm, setIdeaForm] = useState({ content: "", linkedProjectId: "" });
  const [eventForm, setEventForm] = useState({
    title: "",
    duration: "",
    category: PRESET_CATEGORIES[0].name,
    projectId: "",
  });
  const [categoryForm, setCategoryForm] = useState({ name: "", kind: "asset" });
  const [conversionTargets, setConversionTargets] = useState({});
  const [importError, setImportError] = useState("");
  const reviewRef = useRef(null);

  useEffect(() => {
    const normalized = normalizeData(data);
    const saved = saveReviewData(normalized);
    setStorageMessage(saved ? "本地数据已自动保存" : "本地保存失败，请导出备份后检查浏览器权限");
  }, [data]);

  const todayKey = localDateKey();
  const activeProject =
    data.projects.find((project) => project.id === data.settings.activeProjectId) ||
    data.projects[0] ||
    null;
  const activeProjectTasks = activeProject
    ? data.tasks.filter((task) => task.projectId === activeProject.id)
    : [];
  const todayEvents = data.events.filter((event) => localDateKey(event.createdAt) === todayKey);
  const todayIdeas = data.ideas.filter((idea) => localDateKey(idea.createdAt) === todayKey);
  const todayCompletedTasks = data.tasks.filter(
    (task) => task.completed && localDateKey(task.completedAt) === todayKey,
  );

  const stats = useMemo(() => {
    const byCategory = data.categories.map((category) => ({
      ...category,
      minutes: todayEvents
        .filter((event) => event.category === category.name)
        .reduce((sum, event) => sum + event.duration, 0),
    }));

    const byProject = data.projects.map((project) => ({
      ...project,
      minutes: todayEvents
        .filter((event) => event.projectId === project.id)
        .reduce((sum, event) => sum + event.duration, 0),
    }));

    return {
      total: todayEvents.reduce((sum, event) => sum + event.duration, 0),
      byCategory: byCategory.filter((item) => item.minutes > 0),
      byProject: byProject.filter((item) => item.minutes > 0),
    };
  }, [data.categories, data.projects, todayEvents]);

  const review = useMemo(
    () => buildReview({ data, todayEvents, todayIdeas, todayCompletedTasks, todayKey }),
    [data, todayEvents, todayIdeas, todayCompletedTasks, todayKey],
  );

  const updateData = (updater) => {
    setData((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      const normalized = normalizeData(next);
      return {
        ...normalized,
        projects: normalized.projects.map((project) => ({
          ...project,
          progress: projectProgressFromTasks(project.id, normalized.tasks),
        })),
      };
    });
  };

  const setActiveProject = (projectId) => {
    updateData((current) => ({
      ...current,
      settings: { ...current.settings, activeProjectId: projectId },
    }));
  };

  const addProject = (event) => {
    event.preventDefault();
    const name = projectForm.name.trim();
    if (!name) return;
    const project = {
      id: makeId("project"),
      name,
      description: projectForm.description.trim(),
      createdAt: nowIso(),
      status: "active",
      category: projectForm.category,
      progress: 0,
    };
    updateData((current) => ({
      ...current,
      projects: [project, ...current.projects],
      settings: { ...current.settings, activeProjectId: project.id },
    }));
    setProjectForm({ name: "", description: "", category: projectForm.category });
  };

  const addTask = (event) => {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title || !activeProject) return;
    const task = {
      id: makeId("task"),
      projectId: activeProject.id,
      title,
      completed: false,
      createdAt: nowIso(),
      completedAt: null,
      fromIdeaId: null,
    };
    updateData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setTaskTitle("");
  };

  const toggleTask = (taskId) => {
    updateData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed,
              completedAt: !task.completed ? nowIso() : null,
            }
          : task,
      ),
    }));
  };

  const deleteTask = (taskId) => {
    updateData((current) => ({
      ...current,
      tasks: current.tasks.filter((task) => task.id !== taskId),
    }));
  };

  const addIdea = (event) => {
    event.preventDefault();
    const content = ideaForm.content.trim();
    if (!content) return;
    const idea = {
      id: makeId("idea"),
      content,
      createdAt: nowIso(),
      linkedProjectId: ideaForm.linkedProjectId || activeProject?.id || null,
      status: "open",
    };
    updateData((current) => ({ ...current, ideas: [idea, ...current.ideas] }));
    setIdeaForm({ content: "", linkedProjectId: ideaForm.linkedProjectId });
  };

  const convertIdeaToTask = (ideaId, targetProjectId) => {
    const projectId = targetProjectId || activeProject?.id;
    if (!projectId) return;
    updateData((current) => {
      const idea = current.ideas.find((item) => item.id === ideaId);
      if (!idea || idea.status === "converted") return current;
      const task = {
        id: makeId("task"),
        projectId,
        title: idea.content,
        completed: false,
        createdAt: nowIso(),
        completedAt: null,
        fromIdeaId: idea.id,
      };
      return {
        ...current,
        tasks: [task, ...current.tasks],
        ideas: current.ideas.map((item) =>
          item.id === ideaId ? { ...item, linkedProjectId: projectId, status: "converted" } : item,
        ),
        settings: { ...current.settings, activeProjectId: projectId },
      };
    });
  };

  const addEvent = (event) => {
    event.preventDefault();
    const title = eventForm.title.trim();
    const duration = Number(eventForm.duration);
    if (!title || !Number.isFinite(duration) || duration <= 0) return;
    const dailyEvent = {
      id: makeId("event"),
      title,
      duration: Math.round(duration),
      category: eventForm.category,
      projectId: eventForm.projectId || activeProject?.id || null,
      createdAt: nowIso(),
    };
    updateData((current) => ({ ...current, events: [dailyEvent, ...current.events] }));
    setEventForm({
      title: "",
      duration: "",
      category: eventForm.category,
      projectId: eventForm.projectId,
    });
  };

  const addCategory = (event) => {
    event.preventDefault();
    const name = categoryForm.name.trim();
    if (!name || data.categories.some((category) => category.name === name)) return;
    const category = {
      id: makeId("cat"),
      name,
      kind: categoryForm.kind,
      isPreset: false,
      color: "#c4b5fd",
    };
    updateData((current) => ({ ...current, categories: [...current.categories, category] }));
    setCategoryForm({ name: "", kind: categoryForm.kind });
  };

  const saveTodayReview = () => {
    updateData((current) => ({
      ...current,
      reviews: [review, ...current.reviews.filter((item) => item.date !== todayKey)],
    }));
  };

  const exportReviewPng = async () => {
    if (!reviewRef.current) return;
    const canvas = await html2canvas(reviewRef.current, {
      backgroundColor: "#10111f",
      scale: 2,
      useCORS: true,
    });
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `evening-review-${todayKey}.png`;
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const exportJson = () => {
    const payload = {
      exportedAt: nowIso(),
      storageKey: STORAGE_KEY,
      data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `review-system-backup-${todayKey}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedData = parsed.data || parsed;
      updateData(normalizeData(importedData));
      setImportError("");
    } catch (error) {
      console.error(error);
      setImportError("导入失败：JSON 文件无法解析或结构不正确。");
    } finally {
      event.target.value = "";
    }
  };

  const resetBrokenStorage = () => {
    updateData(createDefaultData());
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local-first Review App</p>
          <h1>第一性原则复盘系统</h1>
          <p className="subtitle">把项目、任务、想法和每日投入沉淀成可复盘的个人资产。</p>
        </div>
        <div className="header-actions" aria-label="数据备份操作">
          <button className="ghost-button" type="button" onClick={exportJson}>
            <FileDown size={18} aria-hidden="true" />
            导出 JSON
          </button>
          <label className="ghost-button file-button">
            <FileUp size={18} aria-hidden="true" />
            导入 JSON
            <input type="file" accept="application/json" onChange={importJson} />
          </label>
        </div>
      </header>

      <section className="privacy-note" aria-label="隐私说明">
        本系统无需登录，所有复盘数据仅保存在你的浏览器本地，不会上传服务器。清除浏览器数据或更换设备可能导致数据丢失，建议定期导出备份。
      </section>

      <section className="status-row" aria-live="polite">
        <span>{storageMessage}</span>
        <span>localStorage key：{STORAGE_KEY}</span>
        {importError ? <strong>{importError}</strong> : null}
      </section>

      <div className="workspace-grid">
        <section className="panel projects-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Projects</p>
              <h2>项目资产</h2>
            </div>
          </div>

          <form className="stack-form" onSubmit={addProject}>
            <input
              data-testid="project-name"
              value={projectForm.name}
              onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })}
              placeholder="新项目名称"
              aria-label="新项目名称"
            />
            <textarea
              data-testid="project-description"
              value={projectForm.description}
              onChange={(event) =>
                setProjectForm({ ...projectForm, description: event.target.value })
              }
              placeholder="项目描述"
              aria-label="项目描述"
              rows={3}
            />
            <select
              value={projectForm.category}
              onChange={(event) =>
                setProjectForm({ ...projectForm, category: event.target.value })
              }
              aria-label="项目分类"
            >
              {data.categories.map((category) => (
                <option key={category.id} value={category.name}>
                  {category.name}
                </option>
              ))}
            </select>
            <button data-testid="add-project" type="submit">
              <Plus size={18} aria-hidden="true" />
              新增项目
            </button>
          </form>

          <div className="project-list" aria-label="项目列表">
            {data.projects.length === 0 ? (
              <p className="empty-text">先创建一个项目，任务和事件就能关联到它。</p>
            ) : (
              data.projects.map((project) => (
                <button
                  className={`project-row ${activeProject?.id === project.id ? "is-active" : ""}`}
                  key={project.id}
                  type="button"
                  onClick={() => setActiveProject(project.id)}
                >
                  <span className="project-row-title">{project.name}</span>
                  <span>{project.category}</span>
                  <span className="progress-track" aria-label={`${project.name} 进度`}>
                    <span style={{ width: `${project.progress}%` }} />
                  </span>
                  <strong>{project.progress}%</strong>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="panel focus-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Active Project</p>
              <h2>{activeProject ? activeProject.name : "未选择项目"}</h2>
            </div>
            {activeProject ? (
              <span className="pill">{activeProject.status === "active" ? "进行中" : "已归档"}</span>
            ) : null}
          </div>

          {activeProject ? (
            <>
              <p className="muted">{activeProject.description || "这个项目还没有描述。"}</p>
              <div className="progress-block">
                <div>
                  <span>项目进度</span>
                  <strong>{activeProject.progress}%</strong>
                </div>
                <span className="progress-track big">
                  <span style={{ width: `${activeProject.progress}%` }} />
                </span>
              </div>

              <form className="inline-form" onSubmit={addTask}>
                <input
                  data-testid="task-title"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="给当前项目新增子任务"
                  aria-label="新增子任务"
                />
                <button data-testid="add-task" type="submit">
                  <Plus size={18} aria-hidden="true" />
                  添加
                </button>
              </form>

              <div className="task-list" aria-label="子任务列表">
                {activeProjectTasks.length === 0 ? (
                  <p className="empty-text">暂无子任务。新增任务后，进度会按完成率自动计算。</p>
                ) : (
                  activeProjectTasks.map((task) => (
                    <div className="task-row" key={task.id}>
                      <button
                        data-testid="toggle-task"
                        className={`check-button ${task.completed ? "checked" : ""}`}
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        aria-label={task.completed ? "标记为未完成" : "标记为完成"}
                      >
                        {task.completed ? <Check size={16} aria-hidden="true" /> : null}
                      </button>
                      <span className={task.completed ? "done-text" : ""}>{task.title}</span>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => deleteTask(task.id)}
                        aria-label="删除任务"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="empty-text">创建项目后，这里会显示任务、进度和项目复盘状态。</p>
          )}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Daily Events</p>
              <h2>今日事件</h2>
            </div>
          </div>

          <form className="stack-form" onSubmit={addEvent}>
            <input
              data-testid="event-title"
              value={eventForm.title}
              onChange={(event) => setEventForm({ ...eventForm, title: event.target.value })}
              placeholder="今天做了什么"
              aria-label="事件标题"
            />
            <div className="two-columns">
              <input
                data-testid="event-duration"
                type="number"
                min="1"
                step="1"
                value={eventForm.duration}
                onChange={(event) => setEventForm({ ...eventForm, duration: event.target.value })}
                placeholder="分钟"
                aria-label="事件时长"
              />
              <select
                value={eventForm.category}
                onChange={(event) =>
                  setEventForm({ ...eventForm, category: event.target.value })
                }
                aria-label="事件分类"
              >
                {data.categories.map((category) => (
                  <option key={category.id} value={category.name}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <select
              value={eventForm.projectId}
              onChange={(event) => setEventForm({ ...eventForm, projectId: event.target.value })}
              aria-label="关联项目"
            >
              <option value="">关联当前项目或不关联</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button data-testid="add-event" type="submit">
              <Plus size={18} aria-hidden="true" />
              记录事件
            </button>
          </form>

          <div className="event-list" aria-label="今日事件列表">
            {todayEvents.length === 0 ? (
              <p className="empty-text">记录今天的真实投入后，统计和复盘卡片会自动更新。</p>
            ) : (
              todayEvents.map((event) => {
                const category = getCategory(data.categories, event.category);
                const project = data.projects.find((item) => item.id === event.projectId);
                return (
                  <div className="event-row" key={event.id}>
                    <span style={{ background: category.color }} />
                    <div>
                      <strong>{event.title}</strong>
                      <small>
                        {event.category}
                        {project ? ` · ${project.name}` : ""}
                      </small>
                    </div>
                    <b>{formatMinutes(event.duration)}</b>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Ideas</p>
              <h2>想法池</h2>
            </div>
          </div>

          <form className="stack-form" onSubmit={addIdea}>
            <textarea
              data-testid="idea-content"
              value={ideaForm.content}
              onChange={(event) => setIdeaForm({ ...ideaForm, content: event.target.value })}
              placeholder="记录一个想法"
              aria-label="想法内容"
              rows={3}
            />
            <select
              value={ideaForm.linkedProjectId}
              onChange={(event) =>
                setIdeaForm({ ...ideaForm, linkedProjectId: event.target.value })
              }
              aria-label="想法关联项目"
            >
              <option value="">暂不指定项目</option>
              {data.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <button data-testid="add-idea" type="submit">
              <Lightbulb size={18} aria-hidden="true" />
              记录想法
            </button>
          </form>

          <div className="idea-list" aria-label="想法列表">
            {data.ideas.length === 0 ? (
              <p className="empty-text">灵感先进入想法池，再转成任务。</p>
            ) : (
              data.ideas.map((idea) => {
                const linkedProject = data.projects.find(
                  (project) => project.id === idea.linkedProjectId,
                );
                const targetProjectId =
                  conversionTargets[idea.id] ||
                  idea.linkedProjectId ||
                  activeProject?.id ||
                  data.projects[0]?.id ||
                  "";
                return (
                  <div className="idea-row" key={idea.id}>
                    <p>{idea.content}</p>
                    <small>
                      {idea.status === "converted" ? "已转任务" : "待处理"}
                      {linkedProject ? ` · ${linkedProject.name}` : ""}
                    </small>
                    {idea.status !== "converted" ? (
                      <div className="idea-actions">
                        <select
                          value={targetProjectId}
                          onChange={(event) =>
                            setConversionTargets({
                              ...conversionTargets,
                              [idea.id]: event.target.value,
                            })
                          }
                          aria-label="选择想法转入的项目"
                        >
                          <option value="">选择目标项目</option>
                          {data.projects.map((project) => (
                            <option key={project.id} value={project.id}>
                              {project.name}
                            </option>
                          ))}
                        </select>
                        <button
                          data-testid="convert-idea"
                          className="small-button"
                          type="button"
                          disabled={!targetProjectId}
                          onClick={() => convertIdeaToTask(idea.id, targetProjectId)}
                        >
                          转任务
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="panel analytics-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Today</p>
              <h2>时间统计</h2>
            </div>
            <strong>{formatMinutes(stats.total)}</strong>
          </div>
          <div className="metric-grid">
            <div>
              <span>今日事件</span>
              <strong>{todayEvents.length}</strong>
            </div>
            <div>
              <span>完成任务</span>
              <strong>{todayCompletedTasks.length}</strong>
            </div>
            <div>
              <span>新增想法</span>
              <strong>{todayIdeas.length}</strong>
            </div>
          </div>

          <div className="stats-list">
            <h3>按分类</h3>
            {stats.byCategory.length === 0 ? (
              <p className="empty-text">暂无分类统计。</p>
            ) : (
              stats.byCategory.map((item) => (
                <div className="stat-row" key={item.id}>
                  <span>{item.name}</span>
                  <strong>{formatMinutes(item.minutes)}</strong>
                </div>
              ))
            )}
          </div>

          <div className="stats-list">
            <h3>按项目</h3>
            {stats.byProject.length === 0 ? (
              <p className="empty-text">暂无项目统计。</p>
            ) : (
              stats.byProject.map((item) => (
                <div className="stat-row" key={item.id}>
                  <span>{item.name}</span>
                  <strong>{formatMinutes(item.minutes)}</strong>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Categories</p>
              <h2>分类系统</h2>
            </div>
          </div>
          <form className="stack-form" onSubmit={addCategory}>
            <input
              data-testid="category-name"
              value={categoryForm.name}
              onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
              placeholder="新增自定义分类"
              aria-label="新增自定义分类"
            />
            <select
              value={categoryForm.kind}
              onChange={(event) => setCategoryForm({ ...categoryForm, kind: event.target.value })}
              aria-label="分类类型"
            >
              <option value="asset">高价值资产</option>
              <option value="maintenance">生存任务</option>
              <option value="drain">注意力消耗</option>
            </select>
            <button data-testid="add-category" type="submit">
              <Plus size={18} aria-hidden="true" />
              新增分类
            </button>
          </form>
          <div className="category-list">
            {data.categories.map((category) => (
              <span className="category-chip" key={category.id}>
                <i style={{ background: category.color }} />
                {category.name}
              </span>
            ))}
          </div>
        </section>

        <section className="panel review-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Evening Review</p>
              <h2>晚间复盘卡片</h2>
            </div>
            <div className="review-actions">
              <button
                className="ghost-button"
                data-testid="save-review"
                type="button"
                onClick={saveTodayReview}
              >
                <RefreshCw size={18} aria-hidden="true" />
                保存
              </button>
              <button
                className="ghost-button"
                data-testid="export-png"
                type="button"
                onClick={exportReviewPng}
              >
                <Download size={18} aria-hidden="true" />
                PNG
              </button>
            </div>
          </div>

          <article className="review-card" ref={reviewRef}>
            <p className="review-date">{review.date}</p>
            <h3>今日投入不是流水账，是明天的决策依据。</h3>
            <div className="review-metrics">
              <div>
                <span>总投入时间</span>
                <strong>{formatMinutes(review.totalMinutes)}</strong>
              </div>
              <div>
                <span>高价值资产</span>
                <strong>{formatMinutes(review.assetMinutes)}</strong>
              </div>
              <div>
                <span>注意力消耗</span>
                <strong>{formatMinutes(review.drainMinutes)}</strong>
              </div>
              <div>
                <span>完成任务</span>
                <strong>{review.completedTaskCount}</strong>
              </div>
              <div>
                <span>新增想法</span>
                <strong>{review.ideaCount}</strong>
              </div>
            </div>
            <div className="recommendation">
              <span>明日建议行动</span>
              <p>{review.recommendation}</p>
            </div>
          </article>

          <p className="muted">
            复盘卡片只根据今天的事件、任务和想法生成；保存后会写入本地 reviews。
          </p>
        </section>
      </div>

      <footer className="footer">
        <button className="ghost-button" type="button" onClick={resetBrokenStorage}>
          重置本地数据
        </button>
        <span>没有登录、没有数据库、没有后端 API；数据隔离由浏览器 localStorage 提供。</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
