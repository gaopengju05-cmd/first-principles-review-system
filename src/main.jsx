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

const getPageFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("page") === "assets" ? "assets" : "record";
};

function App() {
  const [page, setPage] = useState(getPageFromURL);
  const [data, setData] = useState(loadReviewData);
  const [storageMessage, setStorageMessage] = useState("");

  // Sync URL when page changes
  const navigateTo = (p) => {
    setPage(p);
    const url = new URL(window.location);
    if (p === "assets") {
      url.searchParams.set("page", "assets");
    } else {
      url.searchParams.delete("page");
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
      ,
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
      '⚠️ 重置将清除所有本地数据（项目、任务、事件、复盘记录）。

建议先点击「导出 JSON」备份数据。

确定要重置吗？'
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
  const filteredProjects =
    activeCategoryFilter === "all"
      ? data.projects
      : data.projects.filter((project) => project.category === activeCategoryFilter);
  const activeProjectEvents = activeProject
    ? data.events.filter((event) => event.projectId === activeProject.id)
    : [];
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
      {/* Tab bar */}
      <nav className="tab-bar">
        <button
          className={`tab-btn ${page === "record" ? "is-active" : ""}`}
          type="button"
          onClick={() => navigateTo("record")}
        >
          记录
        </button>
        <button
          className={`tab-btn ${page === "assets" ? "is-active" : ""}`}
          type="button"
          onClick={() => navigateTo("assets")}
        >
          资产
        </button>
      </nav>
      <section className="system-status" aria-live="polite">
        <span>
          <ShieldCheck size={15} aria-hidden="true" />
          {storageMessage}
        </span>
        <span>localStorage: {STORAGE_KEY}</span>
        {importError ? <strong>{importError}</strong> : null}
      </section>

      
      {page === "record" && (
      <>
      {/* Hero: compact toolbar */}
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
              <button
                key={preset.title}
                className="hero-record-btn"
                type="button"
                onClick={() => quickRecord(preset, targetCat)}
              >
                <span className="hero-btn-label">{preset.title}</span>
                <span className="hero-btn-meta">{preset.duration}min</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="dashboard-grid" id="workspace">
        <aside className="sidebar-panel record-sidebar">
          <div className="sidebar-brand">
            <div className="brand-mark">
              <span />
              Personal Review System
            </div>
            <p>Life · Assets · Progress</p>
          </div>

          <nav className="side-nav" aria-label="工作台导航">
            <a href="#task-list">子任务</a>
            <a href="#idea-pool">想法池</a>
            <a href="#today-review">今日复盘</a>
          </nav>

          {/* Quick project switcher */}
          <section className="sidebar-section">
            <div className="panel-title compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p className="eyebrow">Focus</p>
                <h3>当前项目</h3>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => navigateTo("assets")}
                title="管理项目与分类"
                style={{ width: "28px", height: "28px", minHeight: "28px", flex: "0 0 28px" }}
              >
                <Settings size={14} aria-hidden="true" />
              </button>
            </div>
            {data.projects.length === 0 ? (
              <div style={{ padding: "8px 0" }}>
                <p className="empty-text">还没有项目</p>
                <button
                  className="cta-button"
                  type="button"
                  onClick={() => navigateTo("assets")}
                  style={{ marginTop: "8px", width: "100%", justifyContent: "center", fontSize: "0.8rem", padding: "8px 12px" }}
                >
                  <Plus size={14} aria-hidden="true" />
                  去创建项目
                </button>
              </div>
            ) : (
              <div className="project-list">
                {data.projects.map((project) => (
                  <div
                    className={`project-row ${activeProject?.id === project.id ? "is-active" : ""}`}
                    key={project.id}
                  >
                    <button
                      className="project-select-button"
                      type="button"
                      onClick={() => setActiveProject(project.id)}
                    >
                      <span className="project-row-title">{project.name}</span>
                      <span className="progress-track" aria-label={`${project.name} 进度`}>
                        <span style={{ width: `${project.progress}%` }} />
                      </span>
                      <strong>{project.progress}%</strong>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>

        <section className="main-panel" id="project-workbench">
          <div className="focus-header">
            <div>
              <p className="eyebrow">Current Focus</p>
              <h2>{activeProject ? activeProject.name : "选择一个长期资产"}</h2>
              {activeProject ? (
                <p>{activeProject.description || "建立项目后，这里会变成今天的执行中心。"}</p>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <p>先创建你的第一个资产项目，然后就能添加子任务、记录时间投入。</p>
                  <button
                    type="button"
                    className="cta-button"
                    onClick={() => {
                      projectFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      projectFormRef.current?.querySelector('input')?.focus();
                    }}
                    style={{ marginTop: '8px' }}
                  >
                    <Plus size={18} aria-hidden="true" />
                    立即创建项目
                  </button>
                </div>
              )}
            </div>
            <div className="focus-score" style={{ "--tone": activeCategory.color }}>
              <span>{activeProject ? activeProject.category : "未开始"}</span>
              <strong>{activeProject ? `${activeProject.progress}%` : "0%"}</strong>
            </div>
          </div>

          <div className="progress-block">
            <div>
              <span>资产推进</span>
              <strong>{activeProject ? `${activeProject.progress}%` : "等待项目"}</strong>
            </div>
            <span className="progress-track big">
              <span style={{ width: `${activeProject?.progress || 0}%` }} />
            </span>
          </div>

          <div className="work-grid">
            <section className="work-card" id="task-list">
              <div className="panel-title compact">
                <p className="eyebrow">Tasks</p>
                <h3>下一步动作</h3>
              </div>
              <form className="inline-form" onSubmit={addTask}>
                <input
                  ref={taskInputRef}
                  data-testid="task-title"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="给当前项目新增子任务"
                  aria-label="新增子任务"
                />
                <button data-testid="add-task" type="submit" disabled={!activeProject}>
                  <Plus size={18} aria-hidden="true" />
                  添加
                </button>
              </form>
              <div className="task-list" aria-label="子任务列表">
                {!activeProject ? (
                  <div className="empty-state-action">
                    <p className="empty-text">需要一个项目来承载任务。</p>
                    <button
                      type="button"
                      className="cta-button"
                      onClick={() => {
                        projectFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        projectFormRef.current?.querySelector('input')?.focus();
                      }}
                    >
                      <Plus size={16} aria-hidden="true" />
                      创建项目
                    </button>
                  </div>
                ) : activeProjectTasks.length === 0 ? (
                  <p className="empty-text">暂无任务。写下一个今天可以完成的小动作。</p>
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
            </section>

            <section className="work-card" id="daily-schedule">
              <div className="panel-title compact">
                <p className="eyebrow">Daily Schedule</p>
                <h3>今日日程</h3>
              </div>
              {!scheduleGenerated ? (
                <div className="schedule-empty">
                  <p>今日还没生成日程。基于你的历史数据智能排程。</p>
                  <button type="button" onClick={handleGenerateSchedule}>
                    生成今日日程
                  </button>
                </div>
              ) : (
                <div className="schedule-body">
                  <div className="schedule-meta">
                    <span>总额度 <strong>{formatMinutes(schedule.quotaMinutes)}</strong></span>
                    <span>已安排 <strong>{formatMinutes(
                      schedule.blocks.reduce((sum, b) => {
                        const [sh, sm] = b.start.split(":").map(Number);
                        const [eh, em] = b.end.split(":").map(Number);
                        return sum + (eh * 60 + em - sh * 60 - sm);
                      }, 0)
                    )}</strong></span>
                    <span>来源 <strong>{{
                      "28d-same-weekday": "近28天同星期几平均",
                      "14d-average": "近14天平均",
                      "default": "默认建议（尚未基于历史）"
                    }[schedule.source] || schedule.source}</strong></span>
                  </div>
                  <div className="schedule-blocks">
                    {schedule.blocks.map((block) => (
                      <div className="schedule-block" key={block.id}>
                        <span className="block-time">{block.start}–{block.end}</span>
                        <span className="block-title">{block.title}</span>
                        <span className="block-category">{block.category}</span>
                      </div>
                    ))}
                  </div>
                  <div className="schedule-actions">
                    <button type="button" onClick={handleGenerateSchedule}>
                      重新生成
                    </button>
                    <button type="button" onClick={handleSaveSchedule}>
                      保存日程历史
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="work-card" id="project-records">

              <div className="panel-title compact">
                <p className="eyebrow">Records</p>
                <h3>项目相关记录</h3>
              </div>
              <div className="event-list" aria-label="项目相关记录列表">
                {!activeProject ? (
                  <p className="empty-text">先选择项目后，这里会显示关联记录。</p>
                ) : activeProjectEvents.length === 0 ? (
                  <p className="empty-text">这个项目还没有关联记录。</p>
                ) : (
                  activeProjectEvents.map((projectEvent) => {
                    const category = getCategory(data.categories, projectEvent.category);
                    return (
                      <div className="event-row" key={projectEvent.id}>
                        <span style={{ background: category.color }} />
                        <div>
                          <strong>{projectEvent.title}</strong>
                          <small>
                            {projectEvent.category} · {localDateKey(projectEvent.createdAt)}
                          </small>
                        </div>
                        <b>{formatMinutes(projectEvent.duration)}</b>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>

          <section className="ideas-panel" id="idea-pool">
          <div className="panel-title">
            <p className="eyebrow">Ideas</p>
            <h2>想法池</h2>
          </div>
          <form className="stack-form" onSubmit={addIdea}>
            <textarea
              data-testid="idea-content"
              value={ideaForm.content}
              onChange={(event) => setIdeaForm({ ...ideaForm, content: event.target.value })}
              placeholder="记录一个还没成型的想法"
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
              收进想法池
            </button>
          </form>

          <div className="idea-list" aria-label="想法列表">
            {data.ideas.length === 0 ? (
              <p className="empty-text">灵感先进入这里，再转成项目任务。</p>
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
        </section>

        <aside className="review-panel" id="today-review">
          <section className="timeline-panel">
            <div className="panel-title compact">
              <p className="eyebrow">Today</p>
              <h2>今日事件</h2>
            </div>
            <div className="schedule-quota-row">
              <span>今日计划额度</span>
              <strong>{scheduleGenerated ? formatMinutes(schedule.quotaMinutes) : "—"}</strong>
            </div>
            <div className="schedule-quota-row">
              <span>实际记录时间</span>
              <strong>{formatMinutes(stats.total)}</strong>
            </div>
            <div className="schedule-quota-row">
              <span>差额</span>
              <strong style={{ color: scheduleGenerated ? (stats.total > schedule.quotaMinutes ? "var(--danger)" : "var(--blue)" ) : "var(--text-mid)" }}>
                {scheduleGenerated ? (stats.total > schedule.quotaMinutes ? `+${formatMinutes(stats.total - schedule.quotaMinutes)}` : formatMinutes(schedule.quotaMinutes - stats.total)) : "—"}
              </strong>
            </div>
            <hr className="schedule-divider" />
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
                  onChange={(event) =>
                    setEventForm({ ...eventForm, duration: event.target.value })
                  }
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
                onChange={(event) =>
                  setEventForm({ ...eventForm, projectId: event.target.value })
                }
                aria-label="关联项目"
              >
                <option value={activeProject?.id || ""}>关联当前项目{activeProject ? '：' + activeProject.name : ''}</option>
                <option value="__none__">不关联项目</option>
                {data.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <button data-testid="add-event" type="submit">
                <Plus size={18} aria-hidden="true" />
                记录投入
              </button>
            </form>

            <div className="event-list" aria-label="今日事件列表">
              {todayEvents.length === 0 ? (
                <p className="empty-text">记录真实投入后，今晚的复盘卡会自动变得有内容。</p>
              ) : (
                todayEvents.map((dailyEvent) => {
                  const category = getCategory(data.categories, dailyEvent.category);
                  const project = data.projects.find((item) => item.id === dailyEvent.projectId);
                  return (
                    <div className="event-row" key={dailyEvent.id}>
                      <span style={{ background: category.color }} />
                      <div>
                        <strong>{dailyEvent.title}</strong>
                        <small>
                          {dailyEvent.category}
                          {project ? ` · ${project.name}` : ""}
                        </small>
                      </div>
                      <b>{formatMinutes(dailyEvent.duration)}</b>
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => deleteEvent(dailyEvent.id)}
                        aria-label={`删除事件 ${dailyEvent.title}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section className="analytics-card">
            <div className="panel-title compact">
              <p className="eyebrow">Time Stats</p>
              <h3>今日时间统计</h3>
            </div>
            <div className="metric-grid">
              <div>
                <BarChart3 size={18} aria-hidden="true" />
                <span>总时间</span>
                <strong>{formatMinutes(stats.total)}</strong>
              </div>
              <div>
                <Target size={18} aria-hidden="true" />
                <span>待办</span>
                <strong>{openTaskCount}</strong>
              </div>
              <div>
                <Lightbulb size={18} aria-hidden="true" />
                <span>想法</span>
                <strong>{openIdeaCount}</strong>
              </div>
            </div>
            <div className="stats-list">
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
            {topCategory ? (
              <p className="insight-line">今日最高投入：{topCategory.name}</p>
            ) : null}
          </section>

          <section className="quick-panel">
            <div className="panel-title compact">
              <p className="eyebrow">Habits</p>
              <h3>快捷记录（点击即记）</h3>
            </div>
            <div className="quick-actions">
              {quickRecordPresets.map((preset) => (
                <button
                  className="ghost-button quick-record-btn"
                  type="button"
                  key={preset.title}
                  onClick={() => quickRecord(preset)}
                  title={}
                >
                  {preset.title}
                  <small>{preset.duration}min</small>
                </button>
              ))}
            </div>
          </section>

          <section className="review-output-panel">
            <div className="panel-title compact">
              <p className="eyebrow">Evening Review</p>
              <h2>今日复盘</h2>
            </div>
            <article className="review-card" ref={reviewRef}>
              <div className="review-topline">
                <span>{review.date}</span>
                <CircleDot size={18} aria-hidden="true" />
              </div>
              <h3>今日投入不是流水账，是明天的决策依据。</h3>
              <div className="review-metrics">
                <div>
                  <span>总投入</span>
                  <strong>{formatMinutes(review.totalMinutes)}</strong>
                </div>
                <div>
                  <span>高价值资产</span>
                  <strong>{assetRatio}%</strong>
                </div>
                <div>
                  <span>注意力消耗</span>
                  <strong>{drainRatio}%</strong>
                </div>
                <div>
                  <span>完成任务</span>
                  <strong>{review.completedTaskCount}</strong>
                </div>
              </div>
              <div className="recommendation">
                <span>明日建议行动</span>
                <p>{review.recommendation}</p>
              </div>
            </article>

            <div className="review-actions">
              <button data-testid="save-review" type="button" onClick={saveTodayReview}>
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
            {data.reviews.length > 0 && (
              <div className="review-history">
                <p className="eyebrow">最近复盘</p>
                {data.reviews.slice(0, 7).map((r) => (
                  <div key={r.id} className="review-history-row">
                    <span>{r.date}</span>
                    <span>{formatMinutes(r.totalMinutes)}</span>
                    <span>{r.completedTaskCount}项</span>
                  </div>
                ))}
              </div>
            )}
          </section>

        </aside>
      </div>
    {toast && (
        <div className="toast-container">
          <span>{toast}</span>
          {undoAction && (
            <button className="toast-undo" type="button" onClick={() => { undoAction(); setToast(null); setUndoAction(null); }}>
              撤销
            </button>
          )}
        </div>
      )}
    
      {/* ═══════════ Assets Page ═══════════ */}
      {page === "assets" && (
        <div className="assets-page">
          {/* Left column: categories + projects */}
          <aside className="assets-sidebar">
            {/* Category editor */}
            <section className="assets-section">
              <div className="panel-title compact category-panel-header">
                <div>
                  <p className="eyebrow">Categories</p>
                  <h3>资产分类</h3>
                </div>
                <button
                  className={`icon-button ${categoryEditMode ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setCategoryEditMode((prev) => !prev)}
                  aria-label="管理分类"
                  title="管理分类"
                >
                  <Settings size={16} aria-hidden="true" />
                </button>
              </div>

              {!categoryEditMode && (
                <div className="filter-list">
                  <button
                    className={activeCategoryFilter === "all" ? "is-active" : ""}
                    type="button"
                    onClick={() => setActiveCategoryFilter("all")}
                  >
                    全部项目
                  </button>
                  {data.categories.map((category) => (
                    <button
                      className={activeCategoryFilter === category.name ? "is-active" : ""}
                      type="button"
                      key={category.id}
                      onClick={() => setActiveCategoryFilter(category.name)}
                    >
                      <i style={{ "--tone": category.color }} />
                      {category.name}
                      {!category.isPositive && <span className="cat-tag">消耗</span>}
                      {category.isPositive && <span className="cat-tag positive">资产</span>}
                    </button>
                  ))}
                </div>
              )}

              {categoryEditMode && (
                <div className="category-edit-list">
                  {data.categories.map((category, idx) => (
                    <div className="category-edit-row" key={category.id}>
                      <span className="cat-grip" title="拖拽排序">
                        <GripVertical size={14} aria-hidden="true" />
                      </span>
                      <InlineCategoryEditor
                        category={category}
                        onSave={(updates) => updateCategory(category.id, updates)}
                        onDelete={() => deleteCategory(category.id)}
                        canDelete={data.categories.length > 1}
                      />
                    </div>
                  ))}
                  <form
                    className="category-add-inline"
                    onSubmit={(e) => { e.preventDefault(); addCategory(e); }}
                  >
                    <input
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                      placeholder="新分类名称"
                      aria-label="新分类名称"
                      className="cat-add-input"
                    />
                    <select
                      value={categoryForm.kind}
                      onChange={(e) => setCategoryForm({ ...categoryForm, kind: e.target.value })}
                      className="cat-add-select"
                    >
                      <option value="asset">正向资产</option>
                      <option value="maintenance">生存任务</option>
                      <option value="drain">注意力消耗</option>
                    </select>
                    <button type="submit" className="icon-button" title="添加分类">
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  </form>
                </div>
              )}
            </section>

            {/* Project list */}
            <section className="assets-section">
              <div className="panel-title compact">
                <p className="eyebrow">Projects</p>
                <h3>项目列表</h3>
              </div>
              <div className="project-list" aria-label="项目列表">
                {data.projects.length === 0 ? (
                  <p className="empty-text">还没有项目。在下方创建第一个资产项目。</p>
                ) : filteredProjects.length === 0 ? (
                  <p className="empty-text">这个分类下还没有项目。</p>
                ) : (
                  filteredProjects.map((project) => (
                    <div
                      className={`project-row ${activeProject?.id === project.id ? "is-active" : ""}`}
                      key={project.id}
                    >
                      <button
                        className="project-select-button"
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
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => deleteProject(project.id)}
                        aria-label={`删除项目 ${project.name}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* New project form */}
            <form className="stack-form compact-form" onSubmit={addProject} ref={projectFormRef}>
              <div className="panel-title compact">
                <p className="eyebrow">Create</p>
                <h3>+ 新建项目</h3>
              </div>
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
                placeholder="一句话描述这个资产"
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
                新建资产
              </button>
            </form>
          </aside>

          {/* Right column: backup + system */}
          <div className="assets-main">
            <section className="assets-section system-section">
              <div className="panel-title compact">
                <p className="eyebrow">System</p>
                <h2>数据备份</h2>
              </div>
              <p style={{ fontSize: "0.82rem", color: "var(--text-soft)", marginBottom: "12px" }}>
                数据只保存在本机浏览器，不会上传到任何服务器。建议定期导出备份。
              </p>
              <div className="backup-row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="ghost-button" type="button" onClick={exportJson}>
                    <FileDown size={16} aria-hidden="true" />
                    导出 JSON
                  </button>
                  <label className="ghost-button file-button">
                    <FileUp size={16} aria-hidden="true" />
                    导入
                    <input type="file" accept="application/json" onChange={importJson} />
                  </label>
                </div>
                <button className="ghost-button danger-button" type="button" onClick={resetBrokenStorage}>
                  重置本地数据
                </button>
              </div>
              {importError ? <p style={{ color: "var(--danger)", fontSize: "0.8rem", marginTop: "8px" }}>{importError}</p> : null}
            </section>

            {/* Category chips overview */}
            <section className="assets-section">
              <div className="panel-title compact">
                <p className="eyebrow">Overview</p>
                <h3>当前分类</h3>
              </div>
              <div className="category-list">
                {data.categories.map((category) => (
                  <span
                    className="category-chip"
                    key={category.id}
                    style={{ "--tone": category.color }}
                  >
                    <i />
                    {category.name}
                  </span>
                ))}
              </div>
            </section>

            {/* Quick stats */}
            <section className="assets-section">
              <div className="panel-title compact">
                <p className="eyebrow">Stats</p>
                <h3>项目总览</h3>
              </div>
              <div className="metric-grid">
                <div>
                  <Target size={18} aria-hidden="true" />
                  <span>项目数</span>
                  <strong>{data.projects.length}</strong>
                </div>
                <div>
                  <BarChart3 size={18} aria-hidden="true" />
                  <span>总任务</span>
                  <strong>{data.tasks.length}</strong>
                </div>
                <div>
                  <Lightbulb size={18} aria-hidden="true" />
                  <span>想法</span>
                  <strong>{data.ideas.length}</strong>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      </>
      )}
</main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
