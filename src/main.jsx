import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import {
  BarChart3,
  CalendarDays,
  Check,
  CircleDot,
  Download,
  Edit3,
  FileDown,
  FileUp,
  GripVertical,
  Lightbulb,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Target,
  Trash2,
  X,
} from "lucide-react";
import "./styles.css";

const STORAGE_KEY = "app:review-system:v1";
const DEEPSEEK_API_KEY = "sk-cfb744f7d7eb4838a812a05a3cd3dca3";

const DEFAULT_CATEGORIES = [
  { id: "cat-academic", name: "学业资产", kind: "asset", type: "growth", isPositive: true, order: 1, color: "#69d2e7" },
  { id: "cat-english", name: "英语资产", kind: "asset", type: "compound", isPositive: true, order: 2, color: "#a7db57" },
  { id: "cat-body", name: "身体资产", kind: "asset", type: "compound", isPositive: true, order: 3, color: "#f6d365" },
  { id: "cat-output", name: "输出资产", kind: "asset", type: "leverage", isPositive: true, order: 4, color: "#fda085" },
  { id: "cat-survival", name: "生存任务", kind: "maintenance", type: "survival", isPositive: false, order: 5, color: "#b8c0ff" },
  { id: "cat-attention", name: "注意力消耗", kind: "drain", type: "consumption", isPositive: false, order: 6, color: "#ff8fab" },
  { id: "cat-relation", name: "关系资产", kind: "asset", type: "compound", isPositive: true, order: 7, color: "#8ecae6" },
  { id: "cat-finance", name: "财务资产", kind: "asset", type: "growth", isPositive: true, order: 8, color: "#80ed99" },
];

const makeId = (prefix) => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const nowIso = () => new Date().toISOString();

// ── Schedule helpers ──────────────────────────────
const SCHED_WINDOW_START = 7 * 60; // 07:00 in minutes
const SCHED_WINDOW_END = 23 * 60; // 23:00 in minutes
const SCHED_SLOT = 30; // minutes
const SCHED_TOTAL_WINDOW = SCHED_WINDOW_END - SCHED_WINDOW_START; // 960 min

const minutesToTime = (m) => {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

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
  categories: DEFAULT_CATEGORIES,
  reviews: [],
  schedules: [],
  settings: {
    theme: "dark-purple",
    activeProjectId: null,
    lastOpenDate: localDateKey(),
  },
});

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const normalizeCategory = (cat) => ({
  id: cat.id || makeId("cat"),
  name: String(cat.name || "未命名"),
  kind: ["asset", "maintenance", "drain"].includes(cat.kind) ? cat.kind : "asset",
  type: ["survival", "growth", "leverage", "compound", "consumption"].includes(cat.type) ? cat.type : "growth",
  isPositive: typeof cat.isPositive === "boolean" ? cat.isPositive : (cat.kind !== "drain"),
  order: typeof cat.order === "number" ? cat.order : 99,
  color: cat.color || "#c4b5fd",
});

const mergeCategories = (rawCategories) => {
  const incoming = ensureArray(rawCategories);
  if (incoming.length === 0) return DEFAULT_CATEGORIES.map(normalizeCategory);
  const merged = incoming.map(normalizeCategory);
  merged.sort((a, b) => a.order - b.order);
  return merged;
};

const projectProgressFromTasks = (projectId, tasks) => {
  const projectTasks = tasks.filter((task) => task.projectId === projectId);
  if (projectTasks.length === 0) return 0;
  const completed = projectTasks.filter((task) => task.completed).length;
  return Math.round((completed / projectTasks.length) * 100);
};

const normalizeData = (raw, options = {}) => {
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

  const schedules = ensureArray(raw.schedules).map((s) => ({
    id: s.id || makeId("sched"),
    date: String(s.date || ""),
    createdAt: s.createdAt || nowIso(),
    quotaMinutes: Number(s.quotaMinutes) || 0,
    source: String(s.source || "default"),
    blocks: ensureArray(s.blocks).map((b) => ({
      id: b.id || makeId("blk"),
      start: String(b.start || ""),
      end: String(b.end || ""),
      title: String(b.title || ""),
      category: String(b.category || ""),
      projectId: b.projectId || null,
      taskId: b.taskId || null,
      kind: String(b.kind || "task"),
      status: String(b.status || "scheduled"),
    })),
  }));

  return {
    projects: normalizedProjects,
    tasks,
    schedules,
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
      lastOpenDate: options.keepLastOpenDate ? (raw.settings && raw.settings.lastOpenDate ? raw.settings.lastOpenDate : localDateKey()) : localDateKey(),
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
  categories.find((category) => category.name === name) || categories[0] || DEFAULT_CATEGORIES[0];

const buildReview = ({ data, todayEvents, todayIdeas, todayCompletedTasks, todayKey }) => {
  const categoryMap = new Map(data.categories.map((category) => [category.name, category]));
  const totalMinutes = todayEvents.reduce((sum, event) => sum + event.duration, 0);
  const assetMinutes = todayEvents
    .filter((event) => categoryMap.get(event.category)?.isPositive !== false)
    .reduce((sum, event) => sum + event.duration, 0);
  const drainMinutes = todayEvents
    .filter((event) => categoryMap.get(event.category)?.isPositive === false)
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

// ===== Schedule Generation Logic =====
const calcQuotaFromHistory = (data) => {
  const todayDate = new Date();
  const todayDow = todayDate.getDay();

  const cutoff28 = new Date(todayDate);
  cutoff28.setDate(cutoff28.getDate() - 28);
  const sameDowEvents = data.events.filter((e) => {
    const d = new Date(e.createdAt);
    return !Number.isNaN(d.getTime()) && d >= cutoff28 && d.getDay() === todayDow && e.duration > 0;
  });
  if (sameDowEvents.length >= 3) {
    const total = sameDowEvents.reduce((sum, e) => sum + e.duration, 0);
    return { quota: Math.round(total / sameDowEvents.length), source: "28d-same-weekday" };
  }

  const cutoff14 = new Date(todayDate);
  cutoff14.setDate(cutoff14.getDate() - 14);
  const recentEvents = data.events.filter((e) => {
    const d = new Date(e.createdAt);
    return !Number.isNaN(d.getTime()) && d >= cutoff14 && e.duration > 0;
  });
  if (recentEvents.length > 0) {
    const total = recentEvents.reduce((sum, e) => sum + e.duration, 0);
    return { quota: Math.round(total / recentEvents.length), source: "14d-average" };
  }
  return { quota: 180, source: "default" };
};

const calcCategoryRatio = (data) => {
  const totalEvents = data.events.filter((e) => e.duration > 0);
  if (totalEvents.length === 0) return null;
  const count = {};
  totalEvents.forEach((e) => {
    count[e.category] = (count[e.category] || 0) + 1;
  });
  const ratio = {};
  Object.entries(count).forEach(([cat, cnt]) => {
    ratio[cat] = cnt / totalEvents.length;
  });
  return ratio;
};

const generateDailySchedule = (data) => {
  const today = localDateKey();
  const { quota, source } = calcQuotaFromHistory(data);
  const blocks = [];

  const activeProject = data.projects.find((p) => p.id === data.settings.activeProjectId);
  const currentProjectTasks = activeProject
    ? data.tasks.filter((t) => t.projectId === activeProject.id && !t.completed)
    : [];
  const otherTasks = data.tasks.filter(
    (t) => t.projectId !== activeProject?.id && !t.completed
  );
  const prioritizedTasks = [...currentProjectTasks, ...otherTasks];

  let minutesLeft = quota;
  let slotIndex = 0;

  let taskIdx = 0;
  while (minutesLeft >= SCHED_SLOT && taskIdx < prioritizedTasks.length) {
    const task = prioritizedTasks[taskIdx];
    const blockStart = SCHED_WINDOW_START + slotIndex * SCHED_SLOT;
    if (blockStart + SCHED_SLOT > SCHED_WINDOW_END) break;
    blocks.push({
      id: makeId("blk"),
      start: minutesToTime(blockStart),
      end: minutesToTime(blockStart + SCHED_SLOT),
      title: task.title,
      category: (data.projects.find((p) => p.id === task.projectId) || {}).category || data.categories[0]?.name || "学业资产",
      projectId: task.projectId,
      taskId: task.id,
      kind: "task",
      status: "scheduled",
    });
    minutesLeft -= SCHED_SLOT;
    slotIndex++;
    taskIdx++;
  }

  const placeholderTitles = ["学习", "训练", "复盘", "整理"];
  let phIdx = 0;
  const MAX_PLACEHOLDERS = 4;
  while (minutesLeft >= SCHED_SLOT && phIdx < MAX_PLACEHOLDERS) {
    const blockStart = SCHED_WINDOW_START + slotIndex * SCHED_SLOT;
    if (blockStart + SCHED_SLOT > SCHED_WINDOW_END) break;
    blocks.push({
      id: makeId("blk"),
      start: minutesToTime(blockStart),
      end: minutesToTime(blockStart + SCHED_SLOT),
      title: placeholderTitles[phIdx % placeholderTitles.length],
      category: "学业资产",
      projectId: null,
      taskId: null,
      kind: "placeholder",
      status: "scheduled",
    });
    minutesLeft -= SCHED_SLOT;
    slotIndex++;
    phIdx++;
  }

  return {
    id: makeId("sched"),
    date: today,
    createdAt: nowIso(),
    quotaMinutes: quota,
    source,
    blocks,
  };
};


// ─── Inline Category Editor ───────────────────────
const InlineCategoryEditor = ({ category, onSave, onDelete, canDelete }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [kind, setKind] = useState(category.kind);
  const [color, setColor] = useState(category.color);

  const handleSave = () => {
    onSave({ name: name.trim() || category.name, kind, color });
    setEditing(false);
  };

  const handleCancel = () => {
    setName(category.name);
    setKind(category.kind);
    setColor(category.color);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="cat-edit-content">
        <span className="cat-color-dot" style={{ background: category.color }} />
        <span className="cat-edit-name">{category.name}</span>
        <span className="cat-edit-kind">{category.kind === "asset" ? "资产" : category.kind === "drain" ? "消耗" : "生存"}</span>
        <button className="icon-button cat-action" type="button" onClick={() => setEditing(true)} title="编辑">
          <Edit3 size={12} aria-hidden="true" />
        </button>
        <button className="icon-button cat-action" type="button" onClick={onDelete} title="删除" disabled={!canDelete}>
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="cat-edit-content editing">
      <input
        className="cat-edit-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
      />
      <select className="cat-edit-select" value={kind} onChange={(e) => setKind(e.target.value)}>
        <option value="asset">正向资产</option>
        <option value="maintenance">生存任务</option>
        <option value="drain">注意力消耗</option>
      </select>
      <input
        className="cat-color-picker"
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        title="选择颜色"
      />
      <button className="icon-button cat-action" type="button" onClick={handleSave} title="保存">
        <Check size={12} aria-hidden="true" />
      </button>
      <button className="icon-button cat-action" type="button" onClick={handleCancel} title="取消">
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  );
};

const PAGES = ["record", "review", "dashboard", "assets"];
const getPageFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  const p = params.get("page");
  return PAGES.includes(p) ? p : "record";
};

function App() {
  const [page, setPage] = useState(getPageFromURL);
  const [data, setData] = useState(loadReviewData);
  const [storageMessage, setStorageMessage] = useState("");

  // Sync URL when page changes
  const navigateTo = (p) => {
    setPage(p);
    const url = new URL(window.location);
    if (p === "record") {
      url.searchParams.delete("page");
    } else {
      url.searchParams.set("page", p);
    }
    window.history.pushState({}, "", url);
  };
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    category: DEFAULT_CATEGORIES[0].name,
  });
  const [taskTitle, setTaskTitle] = useState("");
  const [ideaForm, setIdeaForm] = useState({ content: "", linkedProjectId: "" });
  const [eventForm, setEventForm] = useState({
    title: "",
    duration: "",
    category: DEFAULT_CATEGORIES[0].name,
    projectId: "",
  });
  const [categoryForm, setCategoryForm] = useState({ name: "", kind: "asset", type: "growth", color: "#c4b5fd" });
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("all");
  const [conversionTargets, setConversionTargets] = useState({});
  const [importError, setImportError] = useState("");
  const [schedule, setSchedule] = useState(() => {
    const raw = loadReviewData();
    const today = localDateKey();
    return raw.schedules.find((s) => s.date === today) || null;
  });
  const [categoryEditMode, setCategoryEditMode] = useState(false);
  const [scheduleGenerated, setScheduleGenerated] = useState(() => {
    const raw = loadReviewData();
    const today = localDateKey();
    return raw.schedules.some((s) => s.date === today);
  });
  const [toast, setToast] = useState(null);
  const [undoAction, setUndoAction] = useState(null);
  const toastTimerRef = useRef(null);

  const reviewRef = useRef(null);
  const projectFormRef = useRef(null);
  const taskInputRef = useRef(null);

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
      netContribution: todayEvents
        .filter((event) => event.category === category.name)
        .reduce((sum, event) => sum + (category.isPositive ? event.duration : -event.duration), 0),
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
      return normalizeData(next, { keepLastOpenDate: true });
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
    // Auto-focus task input on next render
    setTimeout(() => {
      taskInputRef.current?.focus();
      taskInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const deleteProject = (projectId) => {
    const project = data.projects.find((item) => item.id === projectId);
    if (!project) return;
    const confirmed = window.confirm(
      `确定删除项目「${project.name}」吗？关联的任务、想法和事件也会一起删除。`,
    );
    if (!confirmed) return;

    updateData((current) => {
      const remainingProjects = current.projects.filter((item) => item.id !== projectId);
      const nextActiveProjectId =
        current.settings.activeProjectId === projectId
          ? remainingProjects[0]?.id || null
          : current.settings.activeProjectId;

      return {
        ...current,
        projects: remainingProjects,
        tasks: current.tasks.filter((task) => task.projectId !== projectId),
        ideas: current.ideas.filter((idea) => idea.linkedProjectId !== projectId),
        events: current.events.filter((dailyEvent) => dailyEvent.projectId !== projectId),
        settings: { ...current.settings, activeProjectId: nextActiveProjectId },
      };
    });

    if (eventForm.projectId === projectId) {
      setEventForm((current) => ({ ...current, projectId: "" }));
    }
    if (ideaForm.linkedProjectId === projectId) {
      setIdeaForm((current) => ({ ...current, linkedProjectId: "" }));
    }
    setConversionTargets((current) =>
      Object.fromEntries(Object.entries(current).filter(([, value]) => value !== projectId)),
    );
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


  const handleGenerateSchedule = () => {
    const gen = generateDailySchedule(data);
    setSchedule(gen);
    setScheduleGenerated(true);
  };

  const handleSaveSchedule = () => {
    if (!schedule) return;
    const today = localDateKey();
    updateData((current) => ({
      ...current,
      schedules: [
        schedule,
        ...current.schedules.filter((s) => s.date !== today),
      ],
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
      projectId: eventForm.projectId === "__none__" ? null : (eventForm.projectId || activeProject?.id || null),
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

  const deleteEvent = (eventId) => {
    const dailyEvent = data.events.find((item) => item.id === eventId);
    if (!dailyEvent) return;
    const confirmed = window.confirm(`确定删除事件「${dailyEvent.title}」吗？`);
    if (!confirmed) return;

    updateData((current) => ({
      ...current,
      events: current.events.filter((item) => item.id !== eventId),
    }));
  };

  const addCategory = (event) => {
    event.preventDefault();
    const name = categoryForm.name.trim();
    if (!name || data.categories.some((category) => category.name === name)) return;
    const maxOrder = Math.max(0, ...data.categories.map((c) => c.order));
    const category = normalizeCategory({
      id: makeId("cat"),
      name,
      kind: categoryForm.kind,
      type: categoryForm.type || "growth",
      isPositive: categoryForm.kind !== "drain",
      order: maxOrder + 1,
      color: categoryForm.color || "#c4b5fd",
    });
    updateData((current) => ({ ...current, categories: [...current.categories, category] }));
    setCategoryForm({ name: "", kind: "asset", type: "growth", color: "#c4b5fd" });
  };

  const updateCategory = (catId, updates) => {
    updateData((current) => ({
      ...current,
      categories: current.categories.map((c) =>
        c.id === catId ? normalizeCategory({ ...c, ...updates }) : c
      ),
    }));
  };

  const deleteCategory = (catId) => {
    if (data.categories.length <= 1) {
      showToast("⚠️ 至少保留一个分类");
      return;
    }
    const cat = data.categories.find((c) => c.id === catId);
    if (!cat) return;
    const confirmed = window.confirm(`确定删除分类「${cat.name}」吗？`);
    if (!confirmed) return;
    updateData((current) => ({
      ...current,
      categories: current.categories.filter((c) => c.id !== catId),
    }));
    showToast(`已删除「${cat.name}」`);
  };

  const saveTodayReview = () => {
    updateData((current) => ({
      ...current,
      reviews: [review, ...current.reviews.filter((item) => item.date !== todayKey)],
    }));
    showToast('✅ 今日复盘已保存');
  };

  const showToast = (msg, undo) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    setUndoAction(undo || null);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      setUndoAction(null);
    }, 5000);
  };

  const quickRecord = (preset, fallbackCategory) => {
    const cat = fallbackCategory || data.categories.find((c) => c.name === preset.category)
      || data.categories.find((c) => c.isPositive)
      || data.categories[0];
    const ev = {
      id: makeId('event'),
      title: preset.title,
      duration: Number(preset.duration),
      category: cat ? cat.name : preset.category,
      projectId: activeProject?.id || (data.projects[0]?.id || null),
      createdAt: nowIso(),
    };
    updateData((current) => ({ ...current, events: [ev, ...current.events] }));
    showToast(
      `✅ 已记录「${preset.title}」${preset.duration}分钟`,
      () => {
        updateData((current) => ({
          ...current,
          events: current.events.filter((e) => e.id !== ev.id),
        }));
      }
    );
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
    const confirmed = window.confirm(
      '⚠️ 重置将清除所有本地数据（项目、任务、事件、复盘记录）。\n\n建议先点击「导出 JSON」备份数据。\n\n确定要重置吗？'
    );
    if (!confirmed) return;
    const doubleConfirmed = window.confirm('再次确认：所有数据将被清空，不可恢复。确定继续？');
    if (!doubleConfirmed) return;
    updateData(createDefaultData());
  };

  const assetRatio = stats.total > 0 ? Math.round((review.assetMinutes / stats.total) * 100) : 0;
  const drainRatio = stats.total > 0 ? Math.round((review.drainMinutes / stats.total) * 100) : 0;
  const openTaskCount = data.tasks.filter((task) => !task.completed).length;
  const openIdeaCount = data.ideas.filter((idea) => idea.status !== "converted").length;
  const activeCategory = activeProject
    ? getCategory(data.categories, activeProject.category)
    : data.categories[0] || DEFAULT_CATEGORIES[0];
  const topCategory = stats.byCategory[0];

  // Net asset computation for review page
  const netAssetMinutes = todayEvents.reduce((sum, ev) => {
    const cat = data.categories.find((c) => c.name === ev.category);
    if (!cat) return sum;
    return cat.isPositive ? sum + ev.duration : sum - ev.duration;
  }, 0);

  // Continuous record days
  const consecutiveDays = (() => {
    const dates = [...new Set(data.events.map((e) => localDateKey(e.createdAt)))].sort().reverse();
    if (dates.length === 0) return 0;
    let count = 1;
    const today = localDateKey();
    if (dates[0] !== today) return 0;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i-1]);
      const curr = new Date(dates[i]);
      const diff = (prev - curr) / (1000 * 60 * 60 * 24);
      if (Math.round(diff) === 1) count++;
      else break;
    }
    return count;
  })();

  // 7-day net asset trend
  const netAsset7Day = (() => {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      const dayEvents = data.events.filter((e) => localDateKey(e.createdAt) === key);
      const net = dayEvents.reduce((sum, ev) => {
        const cat = data.categories.find((c) => c.name === ev.category);
        if (!cat) return sum;
        return cat.isPositive ? sum + ev.duration : sum - ev.duration;
      }, 0);
      days.push({ date: key, net, label: `${d.getMonth()+1}/${d.getDate()}` });
    }
    return days;
  })();

  // 30-day category cumulative
  const cat30Day = (() => {
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - 30);
    const map = {};
    data.events.forEach((e) => {
      const d = new Date(e.createdAt);
      if (d >= cutoff) {
        map[e.category] = (map[e.category] || 0) + e.duration;
      }
    });
    return Object.entries(map)
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  })();

  // Mainline asset (category marked as current phase focus)
  const mainlineCategory = data.categories.find((c) => c.type === "growth" && c.isPositive) || data.categories.find((c) => c.isPositive);
  const filteredProjects =
    activeCategoryFilter === "all"
      ? data.projects
      : data.projects.filter((project) => project.category === activeCategoryFilter);
  const activeProjectEvents = activeProject
    ? data.events.filter((event) => event.projectId === activeProject.id)
    : [];

  // ── DeepSeek AI Parse ──────────────────────────
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const parseWithAI = async () => {
    const text = aiInput.trim();
    if (!text) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const catNames = data.categories.map((c) => c.name).join("、");
      const resp = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            {
              role: "system",
              content: `你是一个时间记录解析助手。用户会用自然语言描述他今天做了什么。
请解析出以下信息，以 JSON 数组返回，每个元素代表一条记录：
[{"title": "具体做了什么", "duration": 分钟数(整数), "category": "分类名"}]

可用的分类：${catNames}
规则：
- 如果用户说了时长（如"2小时""30分钟"），准确提取
- 如果没说时长，根据活动类型合理估算（学习/工作类45分钟，运动类60分钟，休闲类30分钟）
- 分类选最匹配的可用分类，不要编造新分类
- 一句话可能包含多个活动，拆成多条记录
- 只返回 JSON 数组，不要任何其他文字`
            },
            { role: "user", content: text }
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });
      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content || "";
      // Extract JSON array
      const match = content.match(/\[[\s\S]*\]/);
      if (!match) throw new Error("AI 返回格式异常");
      const parsed = JSON.parse(match[0]);
      setAiResult(parsed);
    } catch (err) {
      console.error("AI parse error:", err);
      setAiResult([]);
      showToast("AI 解析失败，请手动填写");
    } finally {
      setAiLoading(false);
    }
  };

  const confirmAIRecords = () => {
    if (!aiResult || aiResult.length === 0) return;
    const newEvents = aiResult.map((item) => {
      const cat = data.categories.find((c) => c.name === item.category)
        || data.categories.find((c) => c.isPositive)
        || data.categories[0];
      return {
        id: makeId("event"),
        title: item.title,
        duration: Math.max(1, Math.round(Number(item.duration) || 30)),
        category: cat ? cat.name : (data.categories[0]?.name || "学业资产"),
        projectId: activeProject?.id || (data.projects[0]?.id || null),
        createdAt: nowIso(),
      };
    });
    updateData((current) => ({
      ...current,
      events: [...newEvents, ...current.events],
    }));
    setAiInput("");
    setAiResult(null);
    showToast(`✅ 已记录 ${newEvents.length} 条`);
  };

    const quickRecordPresets = [
    { title: "深度学习", duration: "45", category: "学业资产" },
    { title: "训练", duration: "60", category: "身体资产" },
    { title: "英语输入", duration: "30", category: "英语资产" },
  ];

  const heroQuickRecords = [
    { title: "学习", duration: "45", category: "学业资产" },
    { title: "训练", duration: "60", category: "身体资产" },
    { title: "英语", duration: "30", category: "英语资产" },
  ];

  return (
    <main className="review-os">
      <div className="app-layout">
        <aside className="app-sidebar">
          <div className="sidebar-brand">
            <div className="brand-mark"><span />Personal Review System</div>
            <p>Life · Assets · Progress</p>
          </div>
          <nav className="app-nav">
            <p className="nav-section-label">核心</p>
            <button className={`nav-item ${page === "record" ? "is-active" : ""}`} type="button" onClick={() => navigateTo("record")}>快速记录</button>
            <button className={`nav-item ${page === "review" ? "is-active" : ""}`} type="button" onClick={() => navigateTo("review")}>今日复盘</button>
            <button className={`nav-item ${page === "dashboard" ? "is-active" : ""}`} type="button" onClick={() => navigateTo("dashboard")}>仪表盘</button>
            <p className="nav-section-label">系统</p>
            <button className={`nav-item ${page === "assets" ? "is-active" : ""}`} type="button" onClick={() => navigateTo("assets")}>资产定义</button>
          </nav>
        </aside>
        <div className="app-content">
          <section className="system-status" aria-live="polite">
            <span><ShieldCheck size={15} aria-hidden="true" />{storageMessage}</span>
            <span>localStorage: {STORAGE_KEY}</span>
            {importError ? <strong>{importError}</strong> : null}
          </section>
          
          {/* ═══════════ 快速记录页 ═══════════ */}
          {page === "record" && (
            <div className="page-record">
              {/* Hero quick record */}
              <section className="hero-panel">
                <div className="hero-bar">
                  <h1 className="hero-title">快速记录今天</h1>
                  {(todayEvents.length > 0 || todayCompletedTasks.length > 0) && (
                    <div className="hero-snapshot">
                      {todayEvents.length > 0 && <span>已记录 <strong>{formatMinutes(stats.total)}</strong></span>}
                      {todayCompletedTasks.length > 0 && <span>完成 <strong>{todayCompletedTasks.length}</strong> 项</span>}
                    </div>
                  )}
                </div>
                <div className="hero-actions">
                  {heroQuickRecords.map((preset) => {
                    const targetCat = data.categories.find((c) => c.name === preset.category)
                      || data.categories.find((c) => c.isPositive)
                      || data.categories[0];
                    return (
                      <button key={preset.title} className="hero-record-btn" type="button" onClick={() => quickRecord(preset, targetCat)}>
                        <span className="hero-btn-label">{preset.title}</span>
                        <span className="hero-btn-meta">{preset.duration}min</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Manual record form */}
              {/* AI 流水账输入 */}
              <section className="work-card">
                <div className="panel-title compact">
                  <p className="eyebrow">Record</p>
                  <h3>今天做了什么？</h3>
                </div>
                <div className="ai-input-area">
                  <textarea
                    className="ai-textarea"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="写流水账，AI 帮你记。比如：上午学了2小时 React，下午健身1小时，晚上看了会书"
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        parseWithAI();
                      }
                    }}
                  />
                  <button
                    className="ai-parse-btn"
                    type="button"
                    onClick={parseWithAI}
                    disabled={aiLoading || !aiInput.trim()}
                  >
                    {aiLoading ? "解析中..." : "AI 解析"}
                  </button>
                </div>

                {/* AI result preview */}
                {aiResult && aiResult.length > 0 && (
                  <div className="ai-result">
                    <p className="ai-result-title">解析结果（可修改后确认）</p>
                    {aiResult.map((item, idx) => (
                      <div className="ai-result-row" key={idx}>
                        <input
                          className="ai-result-input"
                          value={item.title}
                          onChange={(e) => {
                            const next = [...aiResult];
                            next[idx] = { ...next[idx], title: e.target.value };
                            setAiResult(next);
                          }}
                        />
                        <input
                          className="ai-result-dur"
                          type="number"
                          min="1"
                          value={item.duration}
                          onChange={(e) => {
                            const next = [...aiResult];
                            next[idx] = { ...next[idx], duration: e.target.value };
                            setAiResult(next);
                          }}
                        />
                        <span className="ai-result-unit">分钟</span>
                        <select
                          className="ai-result-cat"
                          value={item.category}
                          onChange={(e) => {
                            const next = [...aiResult];
                            next[idx] = { ...next[idx], category: e.target.value };
                            setAiResult(next);
                          }}
                        >
                          {data.categories.map((cat) => (
                            <option key={cat.id} value={cat.name}>{cat.name}</option>
                          ))}
                        </select>
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => {
                            setAiResult(aiResult.filter((_, i) => i !== idx));
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    <div className="ai-result-actions">
                      <button className="ai-confirm-btn" type="button" onClick={confirmAIRecords}>
                        <Check size={16} />确认记录 {aiResult.length} 条
                      </button>
                      <button className="ghost-button" type="button" onClick={() => setAiResult(null)}>
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {aiResult && aiResult.length === 0 && (
                  <p className="empty-text" style={{ marginTop: 8 }}>AI 未能解析出有效记录，请尝试用更具体的描述。</p>
                )}

                {/* 手动记录（折叠） */}
                <details className="manual-record-toggle">
                  <summary>或手动填写</summary>
                  <form className="stack-form compact-form" onSubmit={addEvent} style={{ marginTop: 8 }}>
                    <input
                      data-testid="event-title"
                      value={eventForm.title}
                      onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                      placeholder="做了什么"
                      aria-label="事件标题"
                    />
                    <div className="two-columns">
                      <input
                        data-testid="event-duration"
                        type="number" min="1" step="1"
                        value={eventForm.duration}
                        onChange={(e) => setEventForm({ ...eventForm, duration: e.target.value })}
                        placeholder="分钟"
                        aria-label="事件时长"
                      />
                      <select
                        value={eventForm.category}
                        onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}
                        aria-label="事件分类"
                      >
                        {data.categories.map((cat) => (
                          <option key={cat.id} value={cat.name}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                    <button data-testid="add-event" type="submit">
                      <Plus size={18} aria-hidden="true" />添加记录
                    </button>
                  </form>
                </details>
              </section>

              {/* Today's records list */}
              <section className="work-card">
                <div className="panel-title compact">
                  <p className="eyebrow">Today</p>
                  <h3>今日已记录</h3>
                </div>
                <div className="event-list" aria-label="今日事件列表">
                  {todayEvents.length === 0 ? (
                    <p className="empty-text">还没有今天的记录。点击上方按钮或填写表单开始。</p>
                  ) : (
                    todayEvents.map((dailyEvent) => {
                      const cat = getCategory(data.categories, dailyEvent.category);
                      const project = data.projects.find((item) => item.id === dailyEvent.projectId);
                      return (
                        <div className="event-row" key={dailyEvent.id}>
                          <span style={{ background: cat.color }} />
                          <div>
                            <strong>{dailyEvent.title}</strong>
                            <small>{dailyEvent.category}{project ? " · " + project.name : ""}</small>
                          </div>
                          <b>{formatMinutes(dailyEvent.duration)}</b>
                          <button className="icon-button" type="button" onClick={() => deleteEvent(dailyEvent.id)} aria-label={`删除事件 ${dailyEvent.title}`}>
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ═══════════ 今日复盘页 ═══════════ */}
          {page === "review" && (
            <div className="page-review">
              <div className="page-header">
                <h2>今日复盘</h2>
                <p className="text-soft">{todayKey}</p>
              </div>

              {/* Net asset judgment */}
              <section className="review-judgment">
                <div className="judgment-badge" style={{ "--judgment": netAssetMinutes > 0 ? "var(--blue)" : netAssetMinutes === 0 ? "var(--amber)" : "var(--danger)" }}>
                  {netAssetMinutes > 0 ? "正向积累" : netAssetMinutes === 0 ? "持平" : "消耗为主"}
                </div>
                <div className="judgment-metrics">
                  <div className="judgment-metric">
                    <span>总投入</span>
                    <strong>{formatMinutes(stats.total)}</strong>
                  </div>
                  <div className="judgment-metric positive">
                    <span>正向资产</span>
                    <strong>{formatMinutes(review.assetMinutes)}</strong>
                  </div>
                  <div className="judgment-metric negative">
                    <span>注意力消耗</span>
                    <strong>{formatMinutes(review.drainMinutes)}</strong>
                  </div>
                  <div className="judgment-metric" style={{ "--tone": netAssetMinutes >= 0 ? "var(--blue)" : "var(--danger)" }}>
                    <span>净资产</span>
                    <strong>{netAssetMinutes >= 0 ? "+" : ""}{formatMinutes(Math.abs(netAssetMinutes))}</strong>
                  </div>
                </div>
              </section>

              {/* Category distribution */}
              <section className="work-card">
                <div className="panel-title compact">
                  <p className="eyebrow">Distribution</p>
                  <h3>各分类分布</h3>
                </div>
                {stats.byCategory.filter((item) => item.minutes > 0).length === 0 ? (
                  <p className="empty-text">今天还没有记录。</p>
                ) : (
                  <div className="cat-distribution">
                    {stats.byCategory.filter((item) => item.minutes > 0).sort((a, b) => b.minutes - a.minutes).map((item) => {
                      const pct = stats.total > 0 ? Math.round((item.minutes / stats.total) * 100) : 0;
                      return (
                        <div className="dist-row" key={item.id}>
                          <span className="dist-color" style={{ background: item.color }} />
                          <span className="dist-name">{item.name}</span>
                          <span className="dist-bar-track">
                            <span className="dist-bar-fill" style={{ width: `${pct}%`, background: item.color }} />
                          </span>
                          <span className="dist-value">{formatMinutes(item.minutes)}</span>
                          <span className="dist-pct">{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* System judgment + recommendation */}
              <section className="work-card judgment-card">
                <div className="panel-title compact">
                  <p className="eyebrow">Judgment</p>
                  <h3>系统判断</h3>
                </div>
                <div className="judgment-text">
                  {netAssetMinutes > 0 ? (
                    <p>今天你的资产投入高于消耗。明天继续保留第一段清醒时间给最重要的成长资产。</p>
                  ) : netAssetMinutes === 0 ? (
                    <p>今天你的资产投入和消耗持平。明天需要把第一段清醒时间从消耗项里抢回来。</p>
                  ) : (
                    <p>今天注意力消耗高于资产投入。明天先减少一个最低质量消耗项，再谈增加任务。</p>
                  )}
                </div>
                <div className="recommendation-box">
                  <span className="rec-label">明日第一行动建议</span>
                  <p>{review.recommendation}</p>
                </div>
              </section>

              {/* Recent reviews history */}
              {data.reviews.length > 0 && (
                <section className="work-card">
                  <div className="panel-title compact">
                    <p className="eyebrow">History</p>
                    <h3>最近复盘</h3>
                  </div>
                  <div className="review-history-list">
                    {data.reviews.slice(0, 7).map((r) => (
                      <div key={r.id} className="review-history-row">
                        <span>{r.date}</span>
                        <span>{formatMinutes(r.totalMinutes)}</span>
                        <span>{r.completedTaskCount}项任务</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ═══════════ 仪表盘页 ═══════════ */}
          {page === "dashboard" && (
            <div className="page-dashboard">
              <div className="page-header">
                <h2>仪表盘</h2>
                <p className="text-soft">长期趋势总览</p>
              </div>

              {/* Key metrics row */}
              <div className="dash-metrics">
                <div className="dash-metric">
                  <span>连续记录</span>
                  <strong>{consecutiveDays} 天</strong>
                </div>
                <div className="dash-metric">
                  <span>总项目</span>
                  <strong>{data.projects.length}</strong>
                </div>
                <div className="dash-metric">
                  <span>总记录</span>
                  <strong>{data.events.length} 条</strong>
                </div>
                <div className="dash-metric">
                  <span>累计时长</span>
                  <strong>{formatMinutes(data.events.reduce((s, e) => s + e.duration, 0))}</strong>
                </div>
              </div>

              {/* 7-day net asset trend */}
              <section className="work-card">
                <div className="panel-title compact">
                  <p className="eyebrow">Trend</p>
                  <h3>近 7 天净资产趋势</h3>
                </div>
                {netAsset7Day.every((d) => d.net === 0) ? (
                  <p className="empty-text">暂无数据。开始记录后会显示趋势。</p>
                ) : (
                  <div className="trend-bars">
                    {netAsset7Day.map((d) => {
                      const maxNet = Math.max(...netAsset7Day.map((x) => Math.abs(x.net)), 1);
                      const heightPct = Math.min(100, Math.round((Math.abs(d.net) / maxNet) * 100));
                      return (
                        <div className="trend-bar-col" key={d.date}>
                          <div className="trend-bar-value">{d.net > 0 ? "+" : ""}{d.net}min</div>
                          <div className="trend-bar-wrap">
                            <div
                              className={`trend-bar ${d.net >= 0 ? "positive" : "negative"}`}
                              style={{ height: `${Math.max(4, heightPct)}%` }}
                            />
                          </div>
                          <div className="trend-bar-label">{d.label}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 30-day category cumulative */}
              <section className="work-card">
                <div className="panel-title compact">
                  <p className="eyebrow">30 Days</p>
                  <h3>各分类累计时长</h3>
                </div>
                {cat30Day.length === 0 ? (
                  <p className="empty-text">近 30 天暂无记录。</p>
                ) : (
                  <div className="cat-distribution">
                    {cat30Day.map((item) => {
                      const cat = data.categories.find((c) => c.name === item.name);
                      const maxMin = cat30Day[0]?.minutes || 1;
                      const pct = Math.round((item.minutes / maxMin) * 100);
                      return (
                        <div className="dist-row" key={item.name}>
                          <span className="dist-color" style={{ background: cat?.color || "#888" }} />
                          <span className="dist-name">{item.name}</span>
                          <span className="dist-bar-track">
                            <span className="dist-bar-fill" style={{ width: `${pct}%`, background: cat?.color || "#888" }} />
                          </span>
                          <span className="dist-value">{formatMinutes(item.minutes)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Mainline asset */}
              {mainlineCategory && (
                <section className="work-card">
                  <div className="panel-title compact">
                    <p className="eyebrow">Mainline</p>
                    <h3>当前主线资产</h3>
                  </div>
                  <div className="mainline-display">
                    <span className="dist-color" style={{ background: mainlineCategory.color }} />
                    <strong>{mainlineCategory.name}</strong>
                    <span className="text-soft">{formatMinutes(cat30Day.find((c) => c.name === mainlineCategory.name)?.minutes || 0)} / 30天</span>
                  </div>
                </section>
              )}

              {/* Positive vs consumption ratio */}
              <section className="work-card">
                <div className="panel-title compact">
                  <p className="eyebrow">Ratio</p>
                  <h3>正向资产 / 消耗项比例</h3>
                </div>
                {(() => {
                  const posTotal = cat30Day
                    .filter((c) => data.categories.find((cat) => cat.name === c.name)?.isPositive)
                    .reduce((s, c) => s + c.minutes, 0);
                  const negTotal = cat30Day
                    .filter((c) => !data.categories.find((cat) => cat.name === c.name)?.isPositive)
                    .reduce((s, c) => s + c.minutes, 0);
                  const total = posTotal + negTotal;
                  const posPct = total > 0 ? Math.round((posTotal / total) * 100) : 0;
                  return (
                    <div className="ratio-display">
                      <div className="ratio-bar">
                        <span className="ratio-pos" style={{ width: `${posPct}%` }}>{posPct > 10 ? `${posPct}%` : ""}</span>
                        <span className="ratio-neg" style={{ width: `${100-posPct}%` }}>{posPct < 90 ? `${100-posPct}%` : ""}</span>
                      </div>
                      <div className="ratio-labels">
                        <span>正向 {formatMinutes(posTotal)}</span>
                        <span>消耗 {formatMinutes(negTotal)}</span>
                      </div>
                    </div>
                  );
                })()}
              </section>
            </div>
          )}
{/* PAGES WILL BE INSERTED HERE */}
        </div>
      </div>
      {toast && (
        <div className="toast-container">
          <span>{toast}</span>
          {undoAction && (<button className="toast-undo" type="button" onClick={() => { undoAction(); setToast(null); setUndoAction(null); }}>撤销</button>)}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);