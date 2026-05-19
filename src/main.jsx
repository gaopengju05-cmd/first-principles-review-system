import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import html2canvas from "html2canvas";
import {
  BarChart3, CalendarDays, Check, ChevronRight, Circle, Clock,
  Download, Edit3, FileDown, FileUp, Home, Layers, Lightbulb,
  ListTodo, Menu, Moon, Plus, RefreshCw, Settings, Sparkles,
  Target, Trash2, TrendingUp, Zap,
} from "lucide-react";
import "./styles.css";

/* ══════════════════════════════════════════════
   LifeOS — Data layer & constants
   ══════════════════════════════════════════════ */

const STORAGE_KEY = "app:review-system:v1";

const DEFAULT_CATEGORIES = [
  { id: "cat-academic", name: "学业资产", kind: "asset", type: "growth", isPositive: true, isPreset: true, enabled: true, order: 1, color: "#A78BFA" },
  { id: "cat-english", name: "英语资产", kind: "asset", type: "compound", isPositive: true, isPreset: true, enabled: true, order: 2, color: "#34D399" },
  { id: "cat-body", name: "身体资产", kind: "asset", type: "compound", isPositive: true, isPreset: true, enabled: true, order: 3, color: "#FBBF24" },
  { id: "cat-output", name: "输出资产", kind: "asset", type: "leverage", isPositive: true, isPreset: true, enabled: true, order: 4, color: "#FB7185" },
  { id: "cat-survival", name: "生存任务", kind: "maintenance", type: "survival", isPositive: false, isPreset: true, enabled: true, order: 5, color: "#9CA3AF" },
  { id: "cat-attention", name: "注意力消耗", kind: "drain", type: "consumption", isPositive: false, isPreset: true, enabled: true, order: 6, color: "#6B7280" },
  { id: "cat-relation", name: "关系资产", kind: "asset", type: "compound", isPositive: true, isPreset: true, enabled: true, order: 7, color: "#60A5FA" },
  { id: "cat-finance", name: "财务资产", kind: "asset", type: "growth", isPositive: true, isPreset: true, enabled: true, order: 8, color: "#F472B6" },
];

const PRESET_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

const makeId = (prefix) => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};
const nowIso = () => new Date().toISOString();
const localDateKey = (d = new Date()) => {
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
};
const formatMinutes = (m) => {
  const v = Math.max(0, Number(m)||0);
  const h = Math.floor(v/60), r = v%60;
  return h>0 ? `${h}h ${r}m` : `${r}m`;
};

const createDefaultData = () => ({
  projects: [], tasks: [], ideas: [], events: [],
  categories: DEFAULT_CATEGORIES, reviews: [], schedules: [],
  settings: { theme: "obsidian", activeProjectId: null, activePage: "today", sidebarCollapsed: false, dashboardView: "week", lastOpenDate: localDateKey() },
});

const ensureArray = (v) => (Array.isArray(v) ? v : []);

const normalizeCategory = (cat) => ({
  id: cat.id || makeId("cat"),
  name: String(cat.name || "未命名"),
  kind: ["asset","maintenance","drain"].includes(cat.kind) ? cat.kind : "asset",
  type: ["survival","growth","leverage","compound","consumption"].includes(cat.type) ? cat.type : "growth",
  isPositive: typeof cat.isPositive === "boolean" ? cat.isPositive : (cat.kind !== "drain"),
  isPreset: cat.isPreset === true || PRESET_IDS.has(cat.id),
  enabled: cat.enabled !== false,
  order: typeof cat.order === "number" ? cat.order : 99,
  color: cat.color || "#A78BFA",
});

const projectProgress = (pid, tasks) => {
  const ts = tasks.filter((t) => t.projectId === pid);
  if (!ts.length) return 0;
  return Math.round((ts.filter((t) => t.completed).length / ts.length) * 100);
};

const normalizeData = (raw, opts = {}) => {
  const defs = createDefaultData();
  if (!raw || typeof raw !== "object") return defs;
  const tasks = ensureArray(raw.tasks).map((t) => ({
    id: t.id || makeId("task"), projectId: t.projectId || null,
    title: String(t.title || "未命名任务"), completed: Boolean(t.completed),
    createdAt: t.createdAt || nowIso(),
    completedAt: t.completed ? (t.completedAt || nowIso()) : null,
    fromIdeaId: t.fromIdeaId || null,
  }));
  const projects = ensureArray(raw.projects).map((p) => ({
    id: p.id || makeId("project"), name: String(p.name || "未命名项目"),
    description: String(p.description || ""), createdAt: p.createdAt || nowIso(),
    status: p.status || "active", category: p.category || "学业资产", progress: 0,
  }));
  const nProjects = projects.map((p) => ({ ...p, progress: projectProgress(p.id, tasks) }));
  const activePid = nProjects.some((p) => p.id === raw.settings?.activeProjectId)
    ? raw.settings.activeProjectId : (nProjects[0]?.id || null);
  return {
    projects: nProjects, tasks,
    ideas: ensureArray(raw.ideas).map((i) => ({
      id: i.id || makeId("idea"), content: String(i.content || ""),
      createdAt: i.createdAt || nowIso(), linkedProjectId: i.linkedProjectId || null,
      status: i.status === "converted" ? "converted" : "open",
    })),
    events: ensureArray(raw.events).map((e) => ({
      id: e.id || makeId("event"), title: String(e.title || "未命名"),
      duration: Math.max(0, Number(e.duration) || 0), category: e.category || "学业资产",
      projectId: e.projectId || null, taskId: e.taskId || null,
      categoryId: e.categoryId || null, createdAt: e.createdAt || nowIso(),
    })),
    categories: (() => {
      const inc = ensureArray(raw.categories);
      if (!inc.length) return DEFAULT_CATEGORIES.map(normalizeCategory);
      return inc.map(normalizeCategory).sort((a,b) => a.order - b.order);
    })(),
    reviews: ensureArray(raw.reviews).map((r) => ({
      id: r.id || makeId("review"), date: r.date || localDateKey(r.createdAt || new Date()),
      createdAt: r.createdAt || nowIso(), totalMinutes: Number(r.totalMinutes) || 0,
      assetMinutes: Number(r.assetMinutes) || 0, drainMinutes: Number(r.drainMinutes) || 0,
      completedTaskCount: Number(r.completedTaskCount) || 0,
      ideaCount: Number(r.ideaCount) || 0,
      recommendation: String(r.recommendation || ""),
    })),
    schedules: ensureArray(raw.schedules).map((s) => ({
      id: s.id || makeId("sched"), date: String(s.date || ""),
      createdAt: s.createdAt || nowIso(), quotaMinutes: Number(s.quotaMinutes) || 0,
      source: String(s.source || "default"),
      blocks: ensureArray(s.blocks).map((b) => ({
        id: b.id || makeId("blk"), start: String(b.start || ""), end: String(b.end || ""),
        title: String(b.title || ""), category: String(b.category || ""),
        projectId: b.projectId || null, taskId: b.taskId || null,
        kind: String(b.kind || "task"), status: String(b.status || "scheduled"),
      })),
    })),
    settings: { ...defs.settings, ...(raw.settings || {}), activeProjectId: activePid,
      lastOpenDate: opts.keepLastOpenDate ? (raw.settings?.lastOpenDate || localDateKey()) : localDateKey(),
    },
  };
};

const loadData = () => {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return createDefaultData();
    return normalizeData(JSON.parse(s));
  } catch { return createDefaultData(); }
};
const saveData = (d) => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); return true; } catch { return false; } };

const getCategory = (cats, name) => cats.find((c) => c.name === name) || cats[0] || DEFAULT_CATEGORIES[0];


/* ══════════════════════════════════════════════
   LifeOS — App Component
   ══════════════════════════════════════════════ */

const PAGES = ["today","projects","tasks","review","dashboard","assets","backup"];


/* ══════════════════════════════════════════════
   Canvas Chart Components
   ══════════════════════════════════════════════ */

const CHART_COLORS = {
  blue: "#A78BFA", green: "#34D399", red: "#FB7185", amber: "#FBBF24",
  grid: "rgba(255,255,255,0.04)", textSoft: "#6B7280",
};

const DashboardBarChart = ({ data, categories, onBarClick, activeCategory }) => {
  const ref = useRef(null);
  const barRects = useRef([]);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width, h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { top: 10, right: 16, bottom: 28, left: 36 };
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    const maxVal = Math.max(...data.map((d) => d.minutes), 1);
    const barW = Math.max(8, Math.min(36, (cw / data.length) * 0.6));
    const gap = cw / data.length;
    const rects = [];

    // Grid
    ctx.strokeStyle = CHART_COLORS.grid;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = CHART_COLORS.textSoft; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(Math.round(maxVal - (maxVal/4)*i) + "", pad.left - 6, y + 4);
    }

    data.forEach((d, i) => {
      const cat = categories.find((c) => c.name === d.name);
      const barH = (d.minutes / maxVal) * ch;
      const x = pad.left + gap * i + (gap - barW) / 2;
      const y = pad.top + ch - barH;
      const color = cat?.color || CHART_COLORS.blue;
      const isActive = activeCategory === d.name;
      rects.push({ x, y, w: barW, h: barH, name: d.name });

      const grad = ctx.createLinearGradient(x, y, x, pad.top + ch);
      grad.addColorStop(0, isActive ? color : (color + "cc"));
      grad.addColorStop(1, isActive ? color : (color + "22"));
      ctx.fillStyle = grad;
      const r = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x, pad.top + ch); ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y); ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r); ctx.lineTo(x + barW, pad.top + ch);
      ctx.closePath(); ctx.fill();

      if (isActive) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke(); }

      ctx.fillStyle = isActive ? color : "#F4F4F5"; ctx.font = "bold 10px Inter, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(d.minutes + "", x + barW / 2, y - 4);
      ctx.fillStyle = isActive ? color : CHART_COLORS.textSoft; ctx.font = `${isActive ? "bold " : ""}9px Inter, sans-serif`;
      ctx.fillText(d.name.length > 4 ? d.name.slice(0, 4) + ".." : d.name, x + barW/2, pad.top + ch + 16);
    });
    barRects.current = rects;
  }, [data, categories, activeCategory]);

  const handleClick = (e) => {
    if (!onBarClick) return;
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    for (const bar of barRects.current) {
      if (cx >= bar.x && cx <= bar.x + bar.w && cy >= bar.y && cy <= bar.y + bar.h) {
        onBarClick(bar.name); return;
      }
    }
    onBarClick(null);
  };

  return <canvas ref={ref} style={{ width: "100%", height: 200, cursor: onBarClick ? "pointer" : "default" }} onClick={handleClick} />;
};

const DashboardLineChart = ({ data, activeCategory }) => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data.length) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width, h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const pad = { top: 10, right: 16, bottom: 28, left: 36 };
    const cw = w - pad.left - pad.right, ch = h - pad.top - pad.bottom;
    const maxVal = Math.max(...data.map((d) => d.minutes), 1);
    const stepX = data.length > 1 ? cw / (data.length - 1) : cw;

    ctx.strokeStyle = CHART_COLORS.grid;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (ch / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
      ctx.fillStyle = CHART_COLORS.textSoft; ctx.font = "10px Inter, sans-serif"; ctx.textAlign = "right";
      ctx.fillText(Math.round(maxVal - (maxVal/4)*i) + "", pad.left - 6, y + 4);
    }

    const points = data.map((d, i) => ({ x: pad.left + stepX * i, y: pad.top + ch - (d.minutes / maxVal) * ch }));
    const color = activeCategory
      ? (data.categories?.find((c) => c.name === activeCategory)?.color || CHART_COLORS.blue)
      : CHART_COLORS.blue;

    // Fill
    ctx.beginPath(); ctx.moveTo(points[0].x, pad.top + ch);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length-1].x, pad.top + ch); ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, color + "33"); grad.addColorStop(1, color + "04");
    ctx.fillStyle = grad; ctx.fill();

    // Line
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    ctx.beginPath(); points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)); ctx.stroke();

    // Dots
    points.forEach((p, i) => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fillStyle = "#11131A"; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#F4F4F5"; ctx.font = "bold 10px Inter, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(data[i].minutes + "", p.x, p.y - 10);
    });

    ctx.fillStyle = CHART_COLORS.textSoft; ctx.font = "9px Inter, sans-serif"; ctx.textAlign = "center";
    points.forEach((p, i) => {
      if (data.length > 4 && i % 2 !== 0 && i !== data.length-1) return;
      ctx.fillText(data[i].label, p.x, pad.top + ch + 16);
    });
  }, [data, activeCategory]);

  return <canvas ref={ref} style={{ width: "100%", height: 200 }} />;
};

const DashboardPieChart = ({ posMinutes, drainMinutes }) => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const size = 160;
    canvas.width = size * dpr; canvas.height = size * dpr;
    canvas.style.width = size + "px"; canvas.style.height = size + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    const cx = size/2, cy = size/2, r = 60;
    const total = posMinutes + drainMinutes || 1;
    const posAngle = (posMinutes / total) * Math.PI * 2;
    const drainAngle = (drainMinutes / total) * Math.PI * 2;

    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -Math.PI/2, -Math.PI/2 + drainAngle); ctx.closePath();
    ctx.fillStyle = CHART_COLORS.red + "88"; ctx.fill();

    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, -Math.PI/2 + drainAngle, -Math.PI/2 + Math.PI*2); ctx.closePath();
    const grad = ctx.createLinearGradient(cx-r, cy-r, cx+r, cy+r);
    grad.addColorStop(0, CHART_COLORS.green + "cc"); grad.addColorStop(1, CHART_COLORS.blue + "aa");
    ctx.fillStyle = grad; ctx.fill();

    ctx.beginPath(); ctx.arc(cx, cy, 32, 0, Math.PI*2);
    ctx.fillStyle = "#11131A"; ctx.fill();

    const posPct = Math.round((posMinutes / total) * 100);
    ctx.fillStyle = "#F4F4F5"; ctx.font = "bold 13px Inter, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(posPct + "%", cx, cy - 4);
    ctx.fillStyle = CHART_COLORS.textSoft; ctx.font = "9px Inter, sans-serif";
    ctx.fillText("正向", cx, cy + 12);
  }, [posMinutes, drainMinutes]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <canvas ref={ref} width={160} height={160} />
      <div className="flex-row gap-16" style={{ fontSize: "0.72rem", color: "var(--text-soft)" }}>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: CHART_COLORS.green, marginRight: 4, verticalAlign: "middle" }} />正向 {formatMinutes(posMinutes)}</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: CHART_COLORS.red, marginRight: 4, verticalAlign: "middle" }} />消耗 {formatMinutes(drainMinutes)}</span>
      </div>
    </div>
  );
};


function App() {
  const [data, setData] = useState(loadData);
  const [page, setPageRaw] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("page");
    return PAGES.includes(p) ? p : (data.settings?.activePage || "today");
  });
  const setPage = (p) => {
    setPageRaw(p);
    window.history.replaceState(null, "", `?page=${p}`);
  };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pageAnim, setPageAnim] = useState(true);
  const [toast, setToast] = useState(null);
  const [undoAction, setUndoAction] = useState(null);
  const [importError, setImportError] = useState("");
  const reviewRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [dashTimeFilter, setDashTimeFilter] = useState("week");
  const [dashCatFilter, setDashCatFilter] = useState("all");

  const updateData = useCallback((updater) => {
    setData((cur) => {
      const next = typeof updater === "function" ? updater(cur) : updater;
      saveData(normalizeData(next));
      return normalizeData(next);
    });
  }, []);

  const showToast = (msg, undo) => {
    setToast(msg); setUndoAction(undo ? () => undo : null);
    setTimeout(() => { setToast(null); setUndoAction(null); }, undo ? 5000 : 3000);
  };

  // Derived state
  const todayKey = localDateKey();
  const activeProject = data.projects.find((p) => p.id === data.settings.activeProjectId) || null;
  const todayEvents = data.events.filter((e) => localDateKey(e.createdAt) === todayKey);
  const todayTasks = data.tasks.filter((t) => localDateKey(t.createdAt) === todayKey || (t.completed && t.completedAt && localDateKey(t.completedAt) === todayKey));
  const todayCompletedTasks = todayTasks.filter((t) => t.completed);
  const enabledCategories = data.categories.filter((c) => c.enabled !== false);

  // Stats
  const todayStats = useMemo(() => {
    const total = todayEvents.reduce((s,e) => s + e.duration, 0);
    const assetMin = todayEvents.reduce((s,e) => {
      const c = data.categories.find((x) => x.name === e.category);
      return c?.isPositive ? s + e.duration : s;
    }, 0);
    const drainMin = todayEvents.reduce((s,e) => {
      const c = data.categories.find((x) => x.name === e.category);
      return c && !c.isPositive ? s + e.duration : s;
    }, 0);
    const pct = total > 0 ? Math.round((assetMin / total) * 100) : 0;
    return { total, assetMin, drainMin, pct };
  }, [todayEvents, data.categories]);

  // Dashboard stats (time + category filtered)
  const dashStats = useMemo(() => {
    const today = new Date();
    let cutoff = null;
    if (dashTimeFilter === "today") { cutoff = new Date(today); cutoff.setHours(0,0,0,0); }
    else if (dashTimeFilter === "week") { cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 7); }
    else if (dashTimeFilter === "month") { cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 30); }
    let filtered = cutoff
      ? data.events.filter((e) => new Date(e.createdAt) >= cutoff)
      : data.events;
    if (dashCatFilter !== "all") filtered = filtered.filter((e) => e.category === dashCatFilter);

    const totalMinutes = filtered.reduce((s, e) => s + e.duration, 0);
    const recordCount = filtered.length;
    const catMap = {};
    filtered.forEach((e) => { catMap[e.category] = (catMap[e.category] || 0) + e.duration; });
    const byCategory = Object.entries(catMap).map(([name, minutes]) => ({ name, minutes })).sort((a, b) => b.minutes - a.minutes);
    const posMinutes = filtered.reduce((s, e) => { const c = data.categories.find((x) => x.name === e.category); return c?.isPositive ? s + e.duration : s; }, 0);
    const drainMinutes = filtered.reduce((s, e) => { const c = data.categories.find((x) => x.name === e.category); return c && !c.isPositive ? s + e.duration : s; }, 0);
    const trend7Day = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = localDateKey(d);
      const dayMin = filtered.filter((e) => localDateKey(e.createdAt) === key).reduce((s, e) => s + e.duration, 0);
      trend7Day.push({ date: key, label: `${d.getMonth()+1}/${d.getDate()}`, minutes: dayMin });
    }
    const recentRecords = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 8);
    return { totalMinutes, recordCount, byCategory, posMinutes, drainMinutes, trend7Day, recentRecords };
  }, [data.events, dashTimeFilter, dashCatFilter, data.categories]);

  // Quick record handler
  const quickRecord = useCallback((preset) => {
    const cat = data.categories.find((c) => c.name === preset.category) || data.categories[0];
    const ev = {
      id: makeId("event"), title: preset.title, duration: preset.duration,
      category: cat.name, projectId: activeProject?.id || (data.projects[0]?.id || null),
      taskId: null, categoryId: cat.id, createdAt: nowIso(),
    };
    updateData((c) => ({ ...c, events: [ev, ...c.events] }));
    showToast(`已记录「${preset.title}」${preset.duration}m · ${cat.name}`, () => {
      updateData((c) => ({ ...c, events: c.events.filter((e) => e.id !== ev.id) }));
    });
  }, [data.categories, activeProject, data.projects, updateData]);

  // Manual add event
  const [eventForm, setEventForm] = useState({ title:"", duration:"", category:"学业资产" });
  const addEvent = (e) => {
    e.preventDefault();
    const title = eventForm.title.trim();
    const dur = Number(eventForm.duration);
    if (!title || !dur || dur <= 0) return;
    const cat = data.categories.find((c) => c.name === eventForm.category) || data.categories[0];
    const ev = {
      id: makeId("event"), title, duration: Math.round(dur),
      category: cat.name, projectId: activeProject?.id || null,
      taskId: null, categoryId: cat.id, createdAt: nowIso(),
    };
    updateData((c) => ({ ...c, events: [ev, ...c.events] }));
    showToast(`已记录「${title}」${Math.round(dur)}m · ${cat.name}`, () => {
      updateData((c) => ({ ...c, events: c.events.filter((x) => x.id !== ev.id) }));
    });
    setEventForm({ title:"", duration:"", category: eventForm.category });
  };
  const deleteEvent = (id) => {
    const ev = data.events.find((x) => x.id === id);
    if (!ev) return;
    updateData((c) => ({ ...c, events: c.events.filter((x) => x.id !== id) }));
    showToast(`已删除「${ev.title}」`);
  };

  // Project handlers
  const [projectForm, setProjectForm] = useState({ name:"", description:"", category:"学业资产" });
  const addProject = (e) => {
    e.preventDefault();
    const name = projectForm.name.trim();
    if (!name) return;
    const proj = { id: makeId("project"), name, description: projectForm.description.trim(),
      createdAt: nowIso(), status: "active", category: projectForm.category, progress: 0 };
    updateData((c) => ({
      ...c, projects: [proj, ...c.projects],
      settings: { ...c.settings, activeProjectId: proj.id },
    }));
    setProjectForm({ name:"", description:"", category: projectForm.category });
  };
  const deleteProject = (id) => {
    const proj = data.projects.find((p) => p.id === id);
    if (!proj) return;
    if (!window.confirm(`删除项目「${proj.name}」？关联的任务和记录也会删除。`)) return;
    updateData((c) => ({
      ...c,
      projects: c.projects.filter((p) => p.id !== id),
      tasks: c.tasks.filter((t) => t.projectId !== id),
      ideas: c.ideas.filter((i) => i.linkedProjectId !== id),
      events: c.events.filter((ev) => ev.projectId !== id),
      settings: { ...c.settings, activeProjectId: c.settings.activeProjectId === id ? (c.projects.filter((p) => p.id !== id)[0]?.id || null) : c.settings.activeProjectId },
    }));
  };

  // Task handlers
  const [taskForm, setTaskForm] = useState("");
  const [taskProjectId, setTaskProjectId] = useState("");
  const addTask = (e) => {
    e.preventDefault();
    const title = taskForm.trim();
    if (!title) return;
    const pid = taskProjectId || activeProject?.id || null;
    const task = { id: makeId("task"), projectId: pid, title,
      completed: false, createdAt: nowIso(), completedAt: null, fromIdeaId: null };
    updateData((c) => ({ ...c, tasks: [task, ...c.tasks] }));
    setTaskForm("");
    setTaskProjectId("");
    showToast(`已创建任务「${title}」`);
  };
  const toggleTask = (id) => {
    updateData((c) => ({
      ...c,
      tasks: c.tasks.map((t) => t.id === id
        ? { ...t, completed: !t.completed, completedAt: !t.completed ? nowIso() : null }
        : t),
    }));
    const t = data.tasks.find((x) => x.id === id);
    if (t && !t.completed) showToast(`✅ 完成「${t.title}」`);
  };
  const deleteTask = (id) => {
    const t = data.tasks.find((x) => x.id === id);
    if (!t) return;
    updateData((c) => ({ ...c, tasks: c.tasks.filter((x) => x.id !== id) }));
    showToast(`已删除「${t.title}」`);
  };
  const [taskFilter, setTaskFilter] = useState("open");
  const filteredTasks = useMemo(() => {
    let ts = data.tasks;
    if (taskFilter === "today") ts = ts.filter((t) => localDateKey(t.createdAt) === todayKey);
    else if (taskFilter === "open") ts = ts.filter((t) => !t.completed);
    else if (taskFilter === "done") ts = ts.filter((t) => t.completed);
    return ts.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [data.tasks, taskFilter, todayKey]);

  // Project page
  const [projCatFilter, setProjCatFilter] = useState("all");
  const filteredProjects = projCatFilter === "all"
    ? data.projects : data.projects.filter((p) => p.category === projCatFilter);

  // Category handlers
  const [catForm, setCatForm] = useState({ name:"", kind:"asset", color:"#A78BFA" });
  const [editingCat, setEditingCat] = useState(null);
  const addCategory = (e) => {
    e.preventDefault();
    const name = catForm.name.trim();
    if (!name || data.categories.some((c) => c.name === name)) return;
    const cat = normalizeCategory({ id: makeId("cat"), name, kind: catForm.kind,
      isPreset: false, enabled: true, order: data.categories.length + 1, color: catForm.color });
    updateData((c) => ({ ...c, categories: [...c.categories, cat] }));
    setCatForm({ name:"", kind:"asset", color:"#A78BFA" });
  };
  const updateCategory = (id, updates) => {
    updateData((c) => ({
      ...c,
      categories: c.categories.map((cat) => cat.id === id ? normalizeCategory({ ...cat, ...updates }) : cat).sort((a,b) => a.order - b.order),
    }));
  };
  const deleteCategory = (id) => {
    const cat = data.categories.find((c) => c.id === id);
    if (!cat) return;
    if (cat.isPreset) { showToast("⚠️ 预设分类不可删除"); return; }
    if (data.categories.length <= 1) { showToast("⚠️ 至少保留一个分类"); return; }
    updateData((c) => ({ ...c, categories: c.categories.filter((x) => x.id !== id) }));
    showToast(`已删除「${cat.name}」`);
  };

  // Review
  const buildReview = () => {
    const rec = todayStats.total > 0
      ? (todayStats.pct >= 70 ? "今天资产投入占比不错，明天继续保持第一段清醒时间给高价值资产。"
        : todayStats.pct >= 40 ? "资产和消耗基本平衡，明天尝试把第一段清醒时间先给资产。"
        : "今天消耗占比较高，明天先削减一个最低质量消耗入口。")
      : "今天还没有记录，先去记录第一条。";
    return {
      id: makeId("review"), date: todayKey, createdAt: nowIso(),
      totalMinutes: todayStats.total, assetMinutes: todayStats.assetMin,
      drainMinutes: todayStats.drainMin,
      completedTaskCount: todayCompletedTasks.length,
      ideaCount: data.ideas.filter((i) => i.status !== "converted").length,
      recommendation: rec,
    };
  };
  const saveReview = () => {
    const r = buildReview();
    updateData((c) => ({
      ...c,
      reviews: [r, ...c.reviews.filter((x) => x.date !== todayKey)],
    }));
    showToast("复盘已保存");
  };
  const exportPng = async () => {
    if (!reviewRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(reviewRef.current, { backgroundColor: "#11131A", scale: 2 });
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `lifeos-review-${todayKey}.png`; a.click();
        URL.revokeObjectURL(url);
      });
    } finally { setExporting(false); }
  };

  // Export / Import / Reset
  const exportJson = () => {
    const payload = { exportedAt: nowIso(), storageKey: STORAGE_KEY, data };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `lifeos-backup-${todayKey}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importJson = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt);
      updateData(normalizeData(parsed.data || parsed));
      setImportError("");
      showToast("导入成功");
    } catch { setImportError("导入失败：文件格式不正确。"); }
    e.target.value = "";
  };
  const resetData = () => {
    if (!window.confirm("⚠️ 重置将清除所有本地数据。\n\n建议先导出 JSON 备份。\n\n确定重置吗？")) return;
    if (!window.confirm("再次确认：所有数据将被清空。")) return;
    updateData(createDefaultData());
    showToast("数据已重置");
  };

  // Sidebar nav items
  const navItems = [
    { id: "today", icon: Home, label: "今日" },
    { id: "projects", icon: Target, label: "项目" },
    { id: "tasks", icon: ListTodo, label: "任务" },
    { id: "review", icon: Moon, label: "复盘" },
    { id: "dashboard", icon: TrendingUp, label: "仪表盘" },
    { id: "assets", icon: Layers, label: "资产定义" },
    { id: "backup", icon: Download, label: "备份" },
  ];

  const switchPage = (p) => {
    if (p === page) return;
    setPageAnim(false);
    setTimeout(() => { setPage(p); setPageAnim(true); }, 80);
    setSidebarOpen(false);
  };


  return (
    <div className="app-shell">
      {/* ── Sidebar ────────────────────────────── */}
      <aside className={`app-sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">L</div>
          <div>
            <div className="brand-name">LifeOS</div>
            <div className="brand-sub">Personal Asset OS</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="sidebar-section">核心</div>
          {navItems.slice(0, 4).map((n) => (
            <button key={n.id} className={`sidebar-item ${page === n.id ? "is-active" : ""}`}
              type="button" onClick={() => switchPage(n.id)}>
              <n.icon size={18} />{n.label}
            </button>
          ))}
          <div className="sidebar-section">系统</div>
          {navItems.slice(4).map((n) => (
            <button key={n.id} className={`sidebar-item ${page === n.id ? "is-active" : ""}`}
              type="button" onClick={() => switchPage(n.id)}>
              <n.icon size={18} />{n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>localStorage · {data.events.length} 条记录</span>
        </div>
      </aside>

      {/* ── Mobile toggle ──────────────────────── */}
      <button className="mobile-nav-toggle" type="button" onClick={() => setSidebarOpen(!sidebarOpen)}>
        <Menu size={20} />
      </button>

      {/* ── Main content ───────────────────────── */}
      <main className="app-main" key={page}>
        <div className={pageAnim ? "page-enter" : ""}>

        {/* ═══════════ TODAY ═══════════ */}
        {page === "today" && (
          <>
            <h1 className="page-title">今天你把时间投给了什么？</h1>
            <p className="page-subtitle">{todayKey} · 你的每一个选择都在积累资产</p>

            <div className="today-layout">
              <div>
                <div className="hero-input-wrap">
                  <textarea
                    className="hero-input"
                    value={eventForm.title}
                    onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                    placeholder="写下今天的流水账，或者直接快速记录"
                    rows={3}
                  />
                </div>

                <div className="quick-actions">
                  {[
                    { title: "学习", duration: 45, category: "学业资产" },
                    { title: "训练", duration: 60, category: "身体资产" },
                    { title: "英语", duration: 30, category: "英语资产" },
                    { title: "输出", duration: 30, category: "输出资产" },
                  ].map((p) => (
                    <button key={p.title} className="quick-btn" type="button" onClick={() => quickRecord(p)}>
                      <span className="quick-btn-icon">+</span>
                      {p.title} {p.duration}m
                    </button>
                  ))}
                </div>

                {eventForm.title.trim() && Number(eventForm.duration) > 0 && (
                  <form className="inline-form two-cols mb-16" onSubmit={addEvent}>
                    <input type="number" min="1" step="1" value={eventForm.duration}
                      onChange={(e) => setEventForm({ ...eventForm, duration: e.target.value })}
                      placeholder="分钟" />
                    <select value={eventForm.category}
                      onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })}>
                      {enabledCategories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <button className="btn-primary" type="submit" style={{ gridColumn: "1 / -1" }}>
                      <Plus size={16} />添加记录
                    </button>
                  </form>
                )}

                <div className="section-title">今日已记录</div>
                <div className="event-list">
                  {todayEvents.length === 0 ? (
                    <div className="empty-state"><p>还没有今天的记录</p></div>
                  ) : todayEvents.map((ev) => {
                    const cat = getCategory(data.categories, ev.category);
                    const proj = data.projects.find((p) => p.id === ev.projectId);
                    return (
                      <div className="event-row" key={ev.id}>
                        <span className="event-swatch" style={{ background: cat.color }} />
                        <div className="event-info">
                          <strong>{ev.title}</strong>
                          <small>{ev.category}{proj ? " · " + proj.name : ""}</small>
                        </div>
                        <span className="event-duration">{formatMinutes(ev.duration)}</span>
                        <button className="btn-icon danger" type="button" onClick={() => deleteEvent(ev.id)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Insight Panel */}
              <div className="insight-panel">
                <div className="insight-title"><Sparkles size={14} /> Today Insight</div>
                <div className="insight-row">
                  <span className="insight-label">总投入</span>
                  <span className="insight-value accent">{formatMinutes(todayStats.total)}</span>
                </div>
                <div className="insight-row">
                  <span className="insight-label">资产时间</span>
                  <span className="insight-value positive">{formatMinutes(todayStats.assetMin)}</span>
                </div>
                <div className="insight-row">
                  <span className="insight-label">消耗时间</span>
                  <span className="insight-value negative">{formatMinutes(todayStats.drainMin)}</span>
                </div>
                <div className="insight-row">
                  <span className="insight-label">资产率</span>
                  <span className="insight-value accent">{todayStats.pct}%</span>
                </div>
                <div className="insight-row">
                  <span className="insight-label">完成任务</span>
                  <span className="insight-value">{todayCompletedTasks.length} 项</span>
                </div>
                <div className="insight-recommendation">
                  {todayStats.total === 0 ? "今天还没有记录，去快速记录一条开始吧。" :
                   todayStats.pct >= 70 ? "表现不错！继续保持资产优先。" :
                   todayStats.pct >= 40 ? "资产和消耗基本平衡，可以尝试把早上第一段清醒时间留给资产。" :
                   "消耗占比偏高，明天先削减一个最低质量消耗入口再谈增加任务。"}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══════════ PROJECTS ═══════════ */}
        {page === "projects" && (
          <>
            <h1 className="page-title">项目</h1>
            <p className="page-subtitle">管理你的长期资产项目</p>
            <div className="today-layout">
              <div>
                <div className="cat-pills mb-16">
                  <button className={`cat-pill ${projCatFilter === "all" ? "is-active" : ""}`}
                    type="button" onClick={() => setProjCatFilter("all")}>全部</button>
                  {enabledCategories.map((c) => (
                    <button key={c.id} className={`cat-pill ${projCatFilter === c.name ? "is-active" : ""}`}
                      type="button" onClick={() => setProjCatFilter(c.name)}>
                      <span className="cat-pill-dot" style={{ background: c.color }} />{c.name}
                    </button>
                  ))}
                </div>
                <div className="project-grid">
                  {filteredProjects.length === 0 ? (
                    <div className="empty-state" style={{ gridColumn: "1/-1" }}>
                      <p>暂无项目</p>
                    </div>
                  ) : filteredProjects.map((proj) => {
                    const projTasks = data.tasks.filter((t) => t.projectId === proj.id);
                    const openCount = projTasks.filter((t) => !t.completed).length;
                    const todayMin = todayEvents.filter((e) => e.projectId === proj.id).reduce((s,e) => s + e.duration, 0);
                    const cat = getCategory(data.categories, proj.category);
                    return (
                      <div key={proj.id}
                        className={`project-card ${data.settings.activeProjectId === proj.id ? "is-active" : ""}`}
                        onClick={() => updateData((c) => ({ ...c, settings: { ...c.settings, activeProjectId: proj.id } }))}>
                        <div className="project-card-name">{proj.name}</div>
                        <div className="project-card-cat" style={{ color: cat.color }}>{proj.category}</div>
                        <div className="project-card-progress">
                          <div className="project-card-progress-fill" style={{ width: `${proj.progress}%`, background: cat.color }} />
                        </div>
                        <div className="project-card-stats">
                          <span>进度 <strong>{proj.progress}%</strong></span>
                          <span>待办 <strong>{openCount}</strong></span>
                          <span>今日 <strong>{formatMinutes(todayMin)}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form className="inline-form two-cols mt-16" onSubmit={addProject}>
                  <input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                    placeholder="新项目名称" style={{ gridColumn: "1/-1" }} />
                  <input value={projectForm.description} onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                    placeholder="描述（可选）" />
                  <select value={projectForm.category} onChange={(e) => setProjectForm({ ...projectForm, category: e.target.value })}>
                    {enabledCategories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <button className="btn-primary" type="submit" style={{ gridColumn: "1/-1" }}>
                    <Plus size={16} />新增项目
                  </button>
                </form>
              </div>

              {/* Project Detail Panel */}
              {activeProject && (
                <div className="detail-panel">
                  <h3>{activeProject.name}</h3>
                  <div className="detail-meta">{activeProject.category} · 进度 {activeProject.progress}%</div>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginBottom: 16 }}>
                    {activeProject.description || "暂无描述"}
                  </p>
                  <div className="progress-bar mb-16">
                    <div className="progress-fill" style={{ width: `${activeProject.progress}%` }} />
                  </div>
                  <form className="inline-form" onSubmit={addTask}>
                    <input value={taskForm} onChange={(e) => setTaskForm(e.target.value)}
                      placeholder="新增子任务" />
                    <button className="btn-primary" type="submit"><Plus size={14} />添加</button>
                  </form>
                  <div className="event-list mt-16">
                    {data.tasks.filter((t) => t.projectId === activeProject.id).slice(0, 8).map((t) => (
                      <div className="task-row" key={t.id} style={{ opacity: t.completed ? 0.5 : 1 }}>
                        <div className={`task-check ${t.completed ? "done" : ""}`} onClick={() => toggleTask(t.id)}>
                          {t.completed && <Check size={12} />}
                        </div>
                        <div className="task-info">
                          <div className="task-title" style={{ textDecoration: t.completed ? "line-through" : "none" }}>{t.title}</div>
                        </div>
                        <button className="btn-icon danger" type="button" onClick={() => deleteTask(t.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button className="btn-secondary mt-8" type="button" onClick={() => updateData((c) => ({ ...c, settings: { ...c.settings, activeProjectId: null } }))}
                    style={{ width: "100%", justifyContent: "center" }}>
                    关闭详情
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══════════ TASKS ═══════════ */}
        {page === "tasks" && (
          <>
            <h1 className="page-title">任务</h1>
            <p className="page-subtitle">{data.tasks.length} 个任务 · {data.tasks.filter((t) => !t.completed).length} 个待完成</p>

            {/* Quick create task */}
            <form className="inline-form" onSubmit={addTask} style={{ gridTemplateColumns: "1fr auto auto", gap: 8, marginBottom: 16 }}>
              <input
                value={taskForm}
                onChange={(e) => setTaskForm(e.target.value)}
                placeholder="新增任务（如：复习线性代数第三章）"
              />
              <select
                value={taskProjectId}
                onChange={(e) => setTaskProjectId(e.target.value)}
                style={{ minWidth: 130 }}
              >
                <option value="">不关联项目</option>
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button className="btn-primary" type="submit"><Plus size={14} />创建</button>
            </form>

            <div className="task-tabs">
              {[
                { key: "all", label: "全部" },
                { key: "today", label: "今日" },
                { key: "open", label: "未完成" },
                { key: "done", label: "已完成" },
              ].map((f) => (
                <button key={f.key} className={`task-tab ${taskFilter === f.key ? "is-active" : ""}`}
                  type="button" onClick={() => setTaskFilter(f.key)}>{f.label}</button>
              ))}
            </div>
            <div className="event-list">
              {filteredTasks.length === 0 ? (
                <div className="empty-state"><p>暂无任务</p></div>
              ) : filteredTasks.map((t) => {
                const proj = data.projects.find((p) => p.id === t.projectId);
                const cat = proj ? getCategory(data.categories, proj.category) : null;
                return (
                  <div className={`task-row ${t.completed ? "completed" : ""}`} key={t.id}>
                    <div className={`task-check ${t.completed ? "done" : ""}`} onClick={() => toggleTask(t.id)}>
                      {t.completed && <Check size={12} />}
                    </div>
                    <div className="task-info">
                      <div className="task-title">{t.title}</div>
                      <div className="task-meta">
                        {proj && <span style={{ color: cat?.color }}>{proj.name}</span>}
                        {proj && <span>{proj.category}</span>}
                        <span>{localDateKey(t.createdAt)}</span>
                      </div>
                    </div>
                    <button className="btn-icon danger" type="button" onClick={() => deleteTask(t.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ═══════════ REVIEW ═══════════ */}
        {page === "review" && (
          <>
            <h1 className="page-title">晚间复盘</h1>
            <p className="page-subtitle">{todayKey} · 今天你把时间投给了什么</p>
            <div className="review-layout">
              <div>
                <div className="section-title">今日统计</div>
                <div className="grid-2 mb-16">
                  <div className="card">
                    <div className="card-title">总投入</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{formatMinutes(todayStats.total)}</div>
                  </div>
                  <div className="card">
                    <div className="card-title">资产率</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--accent)" }}>{todayStats.pct}%</div>
                  </div>
                  <div className="card">
                    <div className="card-title">完成任务</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--success)" }}>{todayCompletedTasks.length}</div>
                  </div>
                  <div className="card">
                    <div className="card-title">记录条数</div>
                    <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{todayEvents.length}</div>
                  </div>
                </div>
                <div className="flex-row gap-8">
                  <button className="btn-primary" type="button" onClick={saveReview}>
                    <Check size={16} />保存复盘
                  </button>
                </div>
              </div>

              {/* Export card */}
              <div className="review-export-card" ref={reviewRef}>
                <div className="review-badge">DAILY REVIEW</div>
                <div className="review-date">{todayKey}</div>
                <div className="review-metrics">
                  <div className="review-metric">
                    <div className="review-metric-value">{formatMinutes(todayStats.total)}</div>
                    <div className="review-metric-label">总投入</div>
                  </div>
                  <div className="review-metric">
                    <div className="review-metric-value" style={{ color: "var(--success)" }}>{formatMinutes(todayStats.assetMin)}</div>
                    <div className="review-metric-label">资产时间</div>
                  </div>
                  <div className="review-metric">
                    <div className="review-metric-value" style={{ color: "var(--danger)" }}>{formatMinutes(todayStats.drainMin)}</div>
                    <div className="review-metric-label">消耗时间</div>
                  </div>
                  <div className="review-metric">
                    <div className="review-metric-value" style={{ color: "var(--accent)" }}>{todayStats.pct}%</div>
                    <div className="review-metric-label">资产率</div>
                  </div>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", display: "grid", gap: 4, marginBottom: 16 }}>
                  <div className="flex-between"><span>完成任务</span><strong>{todayCompletedTasks.length} 项</strong></div>
                  <div className="flex-between"><span>新增想法</span><strong>{data.ideas.filter((i) => i.status !== "converted").length} 条</strong></div>
                </div>
                <div className="review-recommendation">
                  {buildReview().recommendation}
                </div>
              </div>
            </div>
            <button className="btn-primary mt-16" type="button" onClick={exportPng} disabled={exporting}>
              <Download size={16} />{exporting ? "导出中..." : "导出 PNG"}
            </button>
          </>
        )}

        {/* ═══════════ DASHBOARD ═══════════ */}
        {page === "dashboard" && (
          <>
            <h1 className="page-title">仪表盘</h1>
            <p className="page-subtitle">数据驱动的时间资产管理</p>

            {/* Time + Category filters */}
            <div className="flex-row gap-8 mb-16" style={{ flexWrap: "wrap" }}>
              {[
                { key: "week", label: "本周" },
                { key: "today", label: "今天" },
                { key: "month", label: "本月" },
                { key: "all", label: "全部" },
              ].map((f) => (
                <button key={f.key} className={`task-tab ${dashTimeFilter === f.key ? "is-active" : ""}`}
                  type="button" onClick={() => setDashTimeFilter(f.key)}>{f.label}</button>
              ))}
              <select className="task-tab" style={{ marginLeft: "auto", minWidth: 120 }}
                value={dashCatFilter} onChange={(e) => setDashCatFilter(e.target.value)}>
                <option value="all">全部分类</option>
                {data.categories.filter((c) => c.enabled !== false).map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* KPI cards */}
            <div className="grid-4 mb-16">
              <div className="card">
                <div className="card-title">总投入</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{formatMinutes(dashStats.totalMinutes)}</div>
              </div>
              <div className="card">
                <div className="card-title">正向资产</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--success)" }}>{formatMinutes(dashStats.posMinutes)}</div>
              </div>
              <div className="card">
                <div className="card-title">注意力消耗</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--danger)" }}>{formatMinutes(dashStats.drainMinutes)}</div>
              </div>
              <div className="card">
                <div className="card-title">记录条数</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--accent)" }}>{dashStats.recordCount}</div>
              </div>
            </div>

            {/* Charts row 1 */}
            <div className="grid-2 mb-16">
              <div className="card">
                <div className="card-title">分类投入分布</div>
                <div className="mb-8" style={{ fontSize: "0.68rem", color: "var(--text-faint)" }}>点击分类柱可联动折线图</div>
                {dashStats.byCategory.length > 0 ? (
                  <DashboardBarChart data={dashStats.byCategory} categories={data.categories}
                    onBarClick={(cat) => setDashCatFilter(cat || "all")}
                    activeCategory={dashCatFilter !== "all" ? dashCatFilter : null} />
                ) : <div className="empty-state"><p>暂无数据</p></div>}
              </div>
              <div className="card">
                <div className="card-title">近 7 天投入趋势</div>
                {dashCatFilter !== "all" && (
                  <div className="mb-8" style={{ fontSize: "0.68rem", color: "var(--accent)" }}>筛选：{dashCatFilter}</div>
                )}
                {dashStats.trend7Day.some((d) => d.minutes > 0) ? (
                  <DashboardLineChart data={dashStats.trend7Day} activeCategory={dashCatFilter !== "all" ? dashCatFilter : null} />
                ) : <div className="empty-state"><p>暂无数据</p></div>}
              </div>
            </div>

            {/* Charts row 2 */}
            <div className="grid-2 mb-16">
              <div className="card">
                <div className="card-title">正向 / 消耗比例</div>
                {(dashStats.posMinutes > 0 || dashStats.drainMinutes > 0) ? (
                  <DashboardPieChart posMinutes={dashStats.posMinutes} drainMinutes={dashStats.drainMinutes} />
                ) : <div className="empty-state"><p>暂无数据</p></div>}
              </div>
              <div className="card">
                <div className="card-title">最近记录</div>
                {dashStats.recentRecords.length > 0 ? (
                  <div className="event-list">
                    {dashStats.recentRecords.map((ev) => {
                      const cat = data.categories.find((c) => c.name === ev.category);
                      const proj = data.projects.find((p) => p.id === ev.projectId);
                      return (
                        <div className="event-row" key={ev.id}>
                          <span className="event-swatch" style={{ background: cat?.color || "#888" }} />
                          <div className="event-info">
                            <strong>{ev.title}</strong>
                            <small>{ev.category}{proj ? " · " + proj.name : ""} · {localDateKey(ev.createdAt)}</small>
                          </div>
                          <span className="event-duration">{formatMinutes(ev.duration)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <div className="empty-state"><p>暂无记录</p></div>}
              </div>
            </div>

            {/* Historic reviews */}
            <div className="card">
              <div className="card-title">最近 7 天复盘历史</div>
              {data.reviews.slice(0, 7).length === 0 ? (
                <div className="empty-state"><p>暂无复盘记录</p></div>
              ) : data.reviews.slice(0, 7).map((r) => (
                <div key={r.id} className="flex-between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: "0.8rem" }}>
                  <span>{r.date}</span>
                  <span style={{ color: "var(--text-soft)" }}>{formatMinutes(r.totalMinutes)}</span>
                  <span style={{ color: "var(--text-faint)" }}>{r.completedTaskCount} 项任务</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ═══════════ ASSETS ═══════════ */}
        {page === "assets" && (
          <>
            <h1 className="page-title">资产定义</h1>
            <p className="page-subtitle">管理你的资产分类系统</p>

            <div className="mb-16">
              {data.categories.sort((a,b) => a.order - b.order).map((cat) => (
                <div className="asset-row" key={cat.id}>
                  <input type="color" className="asset-color" value={cat.color}
                    onChange={(e) => updateCategory(cat.id, { color: e.target.value })} />
                  {editingCat === cat.id ? (
                    <>
                      <input style={{ flex: 1 }} value={cat.name}
                        onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                        onBlur={() => setEditingCat(null)} autoFocus />
                      <select value={cat.kind} onChange={(e) => updateCategory(cat.id, { kind: e.target.value, isPositive: e.target.value !== "drain" })}>
                        <option value="asset">正向资产</option>
                        <option value="maintenance">生存任务</option>
                        <option value="drain">注意力消耗</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <div className="asset-info">
                        <div className="asset-name">{cat.name}</div>
                        <div className="asset-kind">{cat.kind === "asset" ? "正向资产" : cat.kind === "maintenance" ? "生存任务" : "注意力消耗"}</div>
                      </div>
                      <button className="btn-ghost" type="button" onClick={() => setEditingCat(cat.id)}>
                        <Edit3 size={14} />
                      </button>
                    </>
                  )}
                  <div className="asset-actions">
                    <button className={`btn-ghost ${!cat.enabled ? "" : ""}`} type="button"
                      onClick={() => updateCategory(cat.id, { enabled: !cat.enabled })}>
                      {cat.enabled ? "启用" : "禁用"}
                    </button>
                    {!cat.isPreset && (
                      <button className="btn-icon danger" type="button" onClick={() => deleteCategory(cat.id)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <form className="inline-form two-cols" onSubmit={addCategory}>
              <input value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                placeholder="新分类名称" />
              <select value={catForm.kind} onChange={(e) => setCatForm({ ...catForm, kind: e.target.value })}>
                <option value="asset">正向资产</option>
                <option value="maintenance">生存任务</option>
                <option value="drain">注意力消耗</option>
              </select>
              <input type="color" value={catForm.color}
                onChange={(e) => setCatForm({ ...catForm, color: e.target.value })}
                style={{ padding: 4, height: 42 }} />
              <button className="btn-primary" type="submit"><Plus size={16} />新增分类</button>
            </form>
          </>
        )}

        {/* ═══════════ BACKUP ═══════════ */}
        {page === "backup" && (
          <>
            <h1 className="page-title">备份</h1>
            <p className="page-subtitle">导出、导入、重置你的数据</p>
            <div className="card mb-16">
              <div className="card-title">数据概览</div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", display: "grid", gap: 4 }}>
                <div className="flex-between"><span>项目</span><strong>{data.projects.length}</strong></div>
                <div className="flex-between"><span>任务</span><strong>{data.tasks.length}</strong></div>
                <div className="flex-between"><span>事件记录</span><strong>{data.events.length}</strong></div>
                <div className="flex-between"><span>复盘记录</span><strong>{data.reviews.length}</strong></div>
                <div className="flex-between"><span>分类</span><strong>{data.categories.length}</strong></div>
              </div>
            </div>
            <div className="backup-actions">
              <button className="btn-primary" type="button" onClick={exportJson}><FileDown size={16} />导出 JSON</button>
              <label className="btn-secondary"><FileUp size={16} />导入 JSON
                <input type="file" accept=".json" onChange={importJson} hidden />
              </label>
              <button className="btn-secondary" type="button" onClick={resetData}><RefreshCw size={16} />重置数据</button>
            </div>
            {importError && <p style={{ color: "var(--danger)", marginTop: 12, fontSize: "0.82rem" }}>{importError}</p>}
          </>
        )}

        </div>
      </main>

      {/* ── Toast ────────────────────────────────── */}
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
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
