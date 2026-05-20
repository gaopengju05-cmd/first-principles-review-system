#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
const outFile = join(dataDir, "demo-backup.json");

const now = new Date();
const iso = now.toISOString();
const dateKey = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, "0"),
  String(now.getDate()).padStart(2, "0"),
].join("-");

const projectId = "demo-project-review-system";
const taskId = "demo-task-review-week";

const backup = {
  exportedAt: iso,
  storageKey: "app:review-system:v1",
  data: {
    projects: [
      {
        id: projectId,
        name: "考试复盘系统",
        description: "用 LifeOS 跟踪每天的学习、输出和消耗时间。",
        createdAt: iso,
        status: "active",
        category: "学业资产",
        progress: 0
      }
    ],
    tasks: [
      {
        id: taskId,
        projectId,
        title: "整理本周错题和复盘卡",
        completed: false,
        createdAt: iso,
        completedAt: null,
        fromIdeaId: null
      },
      {
        id: "demo-task-output",
        projectId,
        title: "写一篇学习总结",
        completed: true,
        createdAt: iso,
        completedAt: iso,
        fromIdeaId: null
      }
    ],
    ideas: [
      {
        id: "demo-idea-1",
        content: "把每天最高质量的第一段时间留给学业资产。",
        createdAt: iso,
        linkedProjectId: projectId,
        status: "open"
      }
    ],
    events: [
      {
        id: "demo-event-english",
        title: "英语阅读精读",
        duration: 90,
        category: "英语资产",
        projectId,
        taskId: null,
        categoryId: null,
        createdAt: iso
      },
      {
        id: "demo-event-review",
        title: "整理错题",
        duration: 75,
        category: "学业资产",
        projectId,
        taskId,
        categoryId: null,
        createdAt: iso
      },
      {
        id: "demo-event-scroll",
        title: "低质量刷屏",
        duration: 35,
        category: "注意力消耗",
        projectId: null,
        taskId: null,
        categoryId: null,
        createdAt: iso
      }
    ],
    categories: [],
    reviews: [
      {
        id: "demo-review-today",
        date: dateKey,
        createdAt: iso,
        totalMinutes: 200,
        assetMinutes: 165,
        drainMinutes: 35,
        completedTaskCount: 1,
        ideaCount: 1,
        recommendation: "今天资产投入占比不错，明天继续保持第一段清醒时间给高价值资产。"
      }
    ],
    schedules: [],
    settings: {
      theme: "obsidian",
      activeProjectId: projectId,
      activePage: "today",
      sidebarCollapsed: false,
      dashboardView: "week",
      lastOpenDate: dateKey
    }
  }
};

mkdirSync(dataDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
console.log(`Wrote ${outFile}`);
