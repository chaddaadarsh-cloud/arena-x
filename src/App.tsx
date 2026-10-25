
import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Team = {
  id: string;
  name: string;
  placement: number;
  kills: number;
};

type OverallTeam = {
  id: string;
  name: string;
  pp: number;
  kp: number;
};

type ToolId = "dashboard" | "match" | "slots" | "overall" | "announce";

type AppData = {
  teams: Team[];
  slots: string[];
  slotCount: number;
  overall: OverallTeam[];
  poster: {
    title: string;
    date: string;
    time: string;
    map: string;
    slots: string;
    prize: string;
    note: string;
  };
};

const STORAGE_KEY = "arena-x-studio-v2";

const placementScores = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0];

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const emptyTeams = (): Team[] =>
  Array.from({ length: 12 }, (_, i) => ({
    id: uid(),
    name: "",
    placement: i + 1,
    kills: 0,
  }));

const defaultData = (): AppData => ({
  teams: emptyTeams(),
  slots: Array(12).fill(""),
  slotCount: 12,
  overall: [],
  poster: {
    title: "ARENA X SCRIMS",
    date: "",
    time: "",
    map: "Bermuda",
    slots: "12 SLOTS",
    prize: "",
    note: "REGISTER WITH ARENA X STAFF",
  },
});

const tools: { id: ToolId; icon: string; title: string; desc: string }[] = [
  { id: "dashboard", icon: "⌂", title: "Dashboard", desc: "Your esports workspace" },
  { id: "match", icon: "▤", title: "Match standings", desc: "Match results and points" },
  { id: "slots", icon: "▦", title: "Slot manager", desc: "Teams and lobby allocation" },
  { id: "overall", icon: "↗", title: "Overall standings", desc: "Cumulative tournament scores" },
  { id: "announce", icon: "✳", title: "Scrims poster", desc: "Event announcement graphics" },
];

function readSavedData(): AppData {
  const fallback = defaultData();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as Partial<AppData>;
    return {
      ...fallback,
      ...parsed,
      teams: Array.isArray(parsed.teams) ? parsed.teams : fallback.teams,
      slots: Array.isArray(parsed.slots) ? parsed.slots : fallback.slots,
      slotCount: Number(parsed.slotCount) || 12,
      overall: Array.isArray(parsed.overall) ? parsed.overall : [],
      poster: { ...fallback.poster, ...(parsed.poster ?? {}) },
    };
  } catch {
    return fallback;
  }
}

function totalFor(team: Pick<OverallTeam, "pp" | "kp">) {
  return team.pp + team.kp;
}

function placementPoints(place: number) {
  return placementScores[Math.min(11, Math.max(0, place - 1))] ?? 0;
}

function sortTeams<T extends { pp: number; kp: number; name: string }>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      totalFor(b) - totalFor(a) ||
      b.kp - a.kp ||
      a.name.localeCompare(b.name),
  );
}

function App() {
  const [data, setData] = useState<AppData>(readSavedData);
  const [active, setActive] = useState<ToolId>("dashboard");
  const [notice, setNotice] = useState("");
  const [matchIndex, setMatchIndex] = useState(() => Number(localStorage.getItem("arena-x-active-match")) || 1);
  const [matchTitle, setMatchTitle] = useState(() => localStorage.getItem("arena-x-active-match-title") || `MATCH ${Number(localStorage.getItem("arena-x-active-match")) || 1}`);
  const [matchSnapshots, setMatchSnapshots] = useState<Record<string, Team[]>>(() => {
    try {
      const saved = localStorage.getItem("arena-x-match-history-v1");
      return saved ? JSON.parse(saved) as Record<string, Team[]> : { "1": readSavedData().teams };
    } catch {
      return { "1": readSavedData().teams };
    }
  });
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      setNotice("Browser storage is full. Export a JSON backup.");
    }
  }, [data]);

  useEffect(() => {
    try { localStorage.setItem("arena-x-match-history-v1", JSON.stringify(matchSnapshots)); } catch { /* keep current session usable */ }
  }, [matchSnapshots]);

  useEffect(() => {
    localStorage.setItem("arena-x-active-match", String(matchIndex));
    localStorage.setItem("arena-x-active-match-title", matchTitle);
  }, [matchIndex, matchTitle]);

  function switchMatch(next: number) {
    if (next === matchIndex) return;
    setMatchSnapshots((previous) => ({ ...previous, [String(matchIndex)]: data.teams }));
    const nextTeams = matchSnapshots[String(next)] ?? emptyTeams();
    updateData("teams", nextTeams);
    setMatchIndex(next);
    setMatchTitle(`MATCH ${next}`);
  }

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const currentTool = tools.find((item) => item.id === active) ?? tools[0];

  const matchRanked = useMemo(() => {
    return data.teams
      .filter((team) => team.name.trim())
      .map((team) => ({
        ...team,
        pp: placementPoints(team.placement),
        kp: team.kills,
        total: placementPoints(team.placement) + team.kills,
      }))
      .sort(
        (a, b) =>
          b.total - a.total ||
          b.kp - a.kp ||
          a.placement - b.placement,
      );
  }, [data.teams]);

  const overallRanked = useMemo(
    () => sortTeams(data.overall.filter((team) => team.name.trim())),
    [data.overall],
  );

  function updateData<K extends keyof AppData>(key: K, value: AppData[K]) {
    setData((previous) => ({ ...previous, [key]: value }));
  }

  function updateTeam(id: string, field: keyof Team, value: string) {
    updateData(
      "teams",
      data.teams.map((team) => {
        if (team.id !== id) return team;
        if (field === "name") return { ...team, name: value };
        const number = Math.max(0, Math.min(999, Number(value) || 0));
        if (field === "placement") {
          return { ...team, placement: Math.min(12, Math.max(1, number)) };
        }
        if (field === "kills") return { ...team, kills: number };
        return team;
      }),
    );
  }

  function updateOverall(id: string, field: "name" | "pp" | "kp", value: string) {
    updateData(
      "overall",
      data.overall.map((team) => {
        if (team.id !== id) return team;
        if (field === "name") return { ...team, name: value };
        return { ...team, [field]: Math.max(0, Math.min(99999, Number(value) || 0)) };
      }),
    );
  }

  function changeSlotCount(count: number) {
    updateData("slotCount", count);
    updateData("slots", Array.from({ length: count }, (_, i) => data.slots[i] ?? ""));
  }

  function loadSlotNames(value: string) {
    const names = value.split(/\r?\n/).slice(0, data.slotCount);
    updateData("slots", Array.from({ length: data.slotCount }, (_, i) => names[i] ?? ""));
  }

  function loadOverallText(value: string) {
    const parsed = value
      .split(/\r?\n/)
      .map((line) => line.split(",").map((part) => part.trim()))
      .filter((row) => row.length >= 3 && row[0])
      .map((row) => ({
        id: uid(),
        name: row[0],
        pp: Math.max(0, Number(row[1]) || 0),
        kp: Math.max(0, Number(row[2]) || 0),
      }));
    if (!parsed.length) {
      setNotice("No valid rows found. Use Team Name, PP, KP.");
      return;
    }
    updateData("overall", parsed);
    setNotice(`${parsed.length} teams imported into overall standings.`);
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, "arena-x-backup.json");
    setNotice("Workspace backup exported.");
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppData>;
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup");
      const fallback = defaultData();
      setData({
        ...fallback,
        ...parsed,
        teams: Array.isArray(parsed.teams) ? parsed.teams : fallback.teams,
        slots: Array.isArray(parsed.slots) ? parsed.slots : fallback.slots,
        overall: Array.isArray(parsed.overall) ? parsed.overall : [],
        slotCount: [12, 18, 24, 48].includes(Number(parsed.slotCount))
          ? Number(parsed.slotCount)
          : 12,
        poster: { ...fallback.poster, ...(parsed.poster ?? {}) },
      });
      setNotice("Backup restored successfully.");
    } catch {
      setNotice("Backup file is invalid. Please select an ARENA X JSON backup.");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  function clearWorkspace() {
    if (!window.confirm("Clear all ARENA X workspace data? Export a backup first if needed.")) return;
    setData(defaultData());
    setNotice("Workspace reset.");
  }

  function exportGraphic(kind: "match" | "slots" | "overall" | "announce") {
    const width = 1080;
    const height = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNotice("Canvas is unavailable in this browser.");
      return;
    }

    if (kind === "match") {
      const W = 1080, H = 1920;
      const c = ctx;
      const bg = c.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#030910"); bg.addColorStop(.48, "#061522"); bg.addColorStop(1, "#02070d");
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      // Fine grain-like grid and angular cyan shards, inspired by the supplied reference.
      c.strokeStyle = "rgba(28,153,226,.11)"; c.lineWidth = 2;
      for (let x = -500; x < W + 500; x += 82) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x - 560, H); c.stroke(); }
      c.fillStyle = "#08243a"; c.beginPath(); c.moveTo(0,0); c.lineTo(265,0); c.lineTo(0,410); c.closePath(); c.fill();
      c.fillStyle = "#06304b"; c.beginPath(); c.moveTo(0,0); c.lineTo(120,0); c.lineTo(0,270); c.closePath(); c.fill();
      c.fillStyle = "#0b3450"; c.beginPath(); c.moveTo(W,H); c.lineTo(W-280,H); c.lineTo(W,H-420); c.closePath(); c.fill();
      c.fillStyle = "#087cb9"; c.beginPath(); c.moveTo(0,120); c.lineTo(70,0); c.lineTo(165,0); c.lineTo(0,250); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(W, H-170); c.lineTo(W-80,H); c.lineTo(W-170,H); c.lineTo(W,H-310); c.closePath(); c.fill();
      const text = (value: string, x: number, y: number, size: number, color: string, weight = 800, align: CanvasTextAlign = "center", family = "Arial Narrow, Impact, sans-serif") => {
        c.font = `${weight} ${size}px ${family}`; c.fillStyle = color; c.textAlign = align; c.fillText(value, x, y); c.textAlign = "left";
      };
      // AX identity and headline
      text("AX", 540, 155, 118, "#dff7ff", 900, "center", "Arial Black, Impact, sans-serif");
      c.fillStyle = "#13bfff"; c.beginPath(); c.moveTo(570,62); c.lineTo(715,30); c.lineTo(607,146); c.closePath(); c.fill();
      text("A R E N A  X", 540, 198, 29, "#f4f8fc", 800);
      text("E S P O R T S", 540, 235, 19, "#bceeff", 700);
      text("PER MATCH", 540, 355, 98, "#f4f6fa", 900, "center", "Impact, Arial Narrow, sans-serif");
      text("STANDINGS", 540, 475, 104, "#11baf5", 900, "center", "Impact, Arial Narrow, sans-serif");
      // Angular match title plate
      c.beginPath(); c.moveTo(315,505); c.lineTo(765,505); c.lineTo(720,562); c.lineTo(270,562); c.closePath();
      c.fillStyle = "#071522"; c.fill(); c.strokeStyle = "#16bdf6"; c.lineWidth = 3; c.stroke();
      text((matchTitle || `MATCH ${matchIndex}`).toUpperCase(), 520, 544, 31, "#f4f8fc", 900);
      // Table grid: match the reference's tall, compact poster table.
      const x0=46, x1=164, x2=548, x3=706, x4=864, x5=1034, headerY=590, headerH=62;
      c.fillStyle = "rgba(7,35,55,.96)"; c.fillRect(x0,headerY,x5-x0,headerH);
      c.strokeStyle="#0aaee9"; c.lineWidth=2; c.strokeRect(x0,headerY,x5-x0,headerH);
      [x1,x2,x3,x4].forEach(x=>{c.beginPath();c.moveTo(x,headerY);c.lineTo(x,headerY+headerH);c.stroke()});
      const heads=[["RANK",(x0+x1)/2],["TEAM NAME",(x1+x2)/2],["PP",(x2+x3)/2],["KP",(x3+x4)/2],["TOTAL",(x4+x5)/2]] as const;
      heads.forEach(([label,x])=>text(label,x,headerY+39,22,"#eaf7ff",800));
      const rowH=68, rowGap=3, rowY=headerY+headerH+8;
      const rows=matchRanked.slice(0,12);
      for(let i=0;i<12;i++){
        const team=rows[i]; const y=rowY+i*(rowH+rowGap);
        c.fillStyle=i%2===0?"rgba(3,13,22,.97)":"rgba(5,19,31,.97)"; c.fillRect(x0,y,x5-x0,rowH);
        c.strokeStyle="#14516f"; c.lineWidth=1.5; c.strokeRect(x0,y,x5-x0,rowH);
        [x1,x2,x3,x4].forEach(x=>{c.beginPath();c.moveTo(x,y);c.lineTo(x,y+rowH);c.stroke()});
        const medal=i===0?"#ffe27a":i===1?"#dbe7ef":i===2?"#dca16b":"#082b45";
        c.fillStyle=medal; c.beginPath(); c.moveTo(x0,y); c.lineTo(x1-2,y); c.lineTo(x1-20,y+rowH); c.lineTo(x0,y+rowH); c.closePath(); c.fill();
        text(String(i+1), (x0+x1)/2-4, y+45, 30, i<3?"#07111b":"#e8f7ff",900);
        const teamName=team?.name?.trim() || "—";
        text(teamName.length>22?`${teamName.slice(0,20)}…`:teamName,x1+26,y+43,25,"#f2f7fc",800,"left","Impact, Arial Narrow, sans-serif");
        text(team?String(team.pp):"—",(x2+x3)/2,y+44,27,"#edf5fc",800);
        text(team?String(team.kp):"—",(x3+x4)/2,y+44,27,"#edf5fc",800);
        c.fillStyle="#06283d"; c.fillRect(x4,y,x5-x4,rowH);
        c.strokeStyle="#0abaf5"; c.lineWidth=2; c.strokeRect(x4,y,x5-x4,rowH);
        text(team?String(team.total):"—",(x4+x5)/2,y+46,35,"#12c2ff",900);
      }
      c.strokeStyle="#1475a1"; c.lineWidth=2; c.beginPath(); c.moveTo(60,1570); c.lineTo(1020,1570); c.stroke();
      text("PLAY  •  COMPETE  •  BELONG",540,1612,21,"#7fc8eb",700);
      text("ARENA X ESPORTS",540,1835,25,"#edf7ff",900);
      text("OFFICIAL MATCH STANDINGS",540,1872,15,"#6388a3",700);
      canvas.toBlob((blob) => { if (!blob) { setNotice("PNG export failed. Please try again."); return; } downloadBlob(blob, `arena-x-${(matchTitle || `match-${matchIndex}`).toLowerCase().replace(/[^a-z0-9]+/g,"-")}.png`); setNotice("Reference-style standings PNG exported."); }, "image/png");
      return;
    }

    const colors = {
      bg: "#07111e",
      panel: "#102235",
      panel2: "#142b3e",
      line: "#2b5068",
      text: "#f2f7fc",
      muted: "#9bb3c6",
      cyan: "#7cddff",
      cyanDeep: "#143b52",
    };

    const roundRect = (x: number, y: number, w: number, h: number, r: number, color: string) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = color;
      ctx.fill();
    };

    const drawText = (
      value: string,
      x: number,
      y: number,
      size: number,
      color: string,
      weight = 600,
      align: CanvasTextAlign = "left",
    ) => {
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
      ctx.fillStyle = color;
      ctx.textAlign = align;
      ctx.fillText(value, x, y);
      ctx.textAlign = "left";
    };

    const fitText = (value: string, maxWidth: number, size: number, weight = 700) => {
      let output = value;
      ctx.font = `${weight} ${size}px Arial, sans-serif`;
      while (output.length > 1 && ctx.measureText(output).width > maxWidth) {
        output = `${output.slice(0, -2)}…`;
      }
      return output;
    };

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors.bg);
    gradient.addColorStop(0.48, "#0c2031");
    gradient.addColorStop(1, "#050b13");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Subtle technical grid and edge accents.
    ctx.strokeStyle = "#234259";
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    for (let y = 0; y < height; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = colors.cyan;
    ctx.beginPath();
    ctx.moveTo(60, 68);
    ctx.lineTo(176, 68);
    ctx.lineTo(150, 90);
    ctx.lineTo(60, 90);
    ctx.closePath();
    ctx.fill();

    drawText("ARENA X", 60, 151, 62, colors.text, 900);
    drawText("ESPORTS", 64, 183, 19, colors.cyan, 800);
    drawText("OFFICIAL COMPETITIVE SERIES", 1020, 142, 15, colors.muted, 700, "right");
    drawText("FREE FIRE  /  BATTLE ROYALE", 1020, 172, 15, colors.muted, 500, "right");
    ctx.fillStyle = colors.line;
    ctx.fillRect(60, 220, 960, 2);

    const heading =
      kind === "slots" ? "OFFICIAL SLOT LIST" :
      kind === "overall" ? "OVERALL STANDINGS" :
      (data.poster.title || "ARENA X SCRIMS").toUpperCase();

    drawText(fitText(heading, 950, 50, 900), 60, 302, 50, colors.text, 900);
    const subtitle =
      kind === "announce"
        ? `${data.poster.date || "DATE TBA"}   /   ${data.poster.time || "TIME TBA"}   /   ${data.poster.map}`
        : kind === "slots"
            ? `${data.slotCount} SLOTS  /  TEAM ALLOCATION`
            : "TOURNAMENT LEADERBOARD";
    drawText(fitText(subtitle.toUpperCase(), 950, 19, 700), 62, 344, 19, colors.cyan, 700);

    if (kind === "overall") {
      const list = overallRanked.map((t) => ({ name: t.name, pp: t.pp, kp: t.kp, total: totalFor(t) }));

      roundRect(60, 390, 960, 65, 8, colors.cyanDeep);
      drawText("#", 88, 431, 18, colors.muted, 800);
      drawText("TEAM", 155, 431, 18, colors.muted, 800);
      drawText("PP", 700, 431, 18, colors.muted, 800, "center");
      drawText("KP", 810, 431, 18, colors.muted, 800, "center");
      drawText("PTS", 940, 431, 18, colors.cyan, 900, "center");

      list.slice(0, 14).forEach((team, index) => {
        const y = 469 + index * 91;
        roundRect(60, y, 960, 78, 8, index === 0 ? "#173d54" : colors.panel);
        ctx.fillStyle = index === 0 ? colors.cyan : colors.line;
        ctx.fillRect(60, y, 5, 78);

        if (index < 3) {
          const medal = ["#82e0ff", "#c5d4df", "#d4a57e"][index];
          ctx.beginPath();
          ctx.arc(103, y + 39, 20, 0, Math.PI * 2);
          ctx.fillStyle = medal;
          ctx.fill();
          drawText(String(index + 1), 103, y + 46, 20, "#06121e", 900, "center");
        } else {
          drawText(String(index + 1).padStart(2, "0"), 103, y + 46, 21, colors.muted, 800, "center");
        }

        drawText(fitText(team.name, 490, 23, 700), 155, y + 45, 23, colors.text, 700);
        drawText(String(team.pp), 700, y + 45, 23, colors.muted, 700, "center");
        drawText(String(team.kp), 810, y + 45, 23, colors.muted, 700, "center");
        drawText(String(team.total), 940, y + 45, 26, colors.cyan, 900, "center");
      });

      if (!list.length) {
        roundRect(60, 480, 960, 110, 8, colors.panel);
        drawText("ADD TEAM DATA IN THE STUDIO", 540, 543, 22, colors.muted, 700, "center");
      }
    }

    if (kind === "slots") {
      const list = data.slots.slice(0, data.slotCount);
      const leftCount = Math.ceil(list.length / 2);
      list.forEach((name, index) => {
        const col = index < leftCount ? 0 : 1;
        const row = col === 0 ? index : index - leftCount;
        const x = col === 0 ? 60 : 550;
        const y = 395 + row * 94;
        roundRect(x, y, 470, 78, 8, colors.panel);
        ctx.fillStyle = colors.cyan;
        ctx.fillRect(x, y, 4, 78);
        drawText(String(index + 1).padStart(2, "0"), x + 23, y + 46, 21, colors.cyan, 900);
        drawText(
          fitText(name.trim() || "AVAILABLE SLOT", 340, 19, 700),
          x + 82,
          y + 45,
          19,
          name.trim() ? colors.text : "#71889b",
          700,
        );
      });
    }

    if (kind === "announce") {
      roundRect(60, 405, 960, 900, 16, colors.panel);
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(80, 425, 920, 860, 12);
      ctx.stroke();
      drawText("ARENA X PRESENTS", 540, 535, 22, colors.cyan, 800, "center");
      drawText(fitText(heading, 820, 48, 900), 540, 640, 48, colors.text, 900, "center");
      ctx.fillStyle = colors.line;
      ctx.fillRect(230, 695, 620, 2);
      drawText(data.poster.date || "DATE TO BE ANNOUNCED", 540, 790, 26, colors.text, 700, "center");
      drawText(data.poster.time || "TIME TO BE ANNOUNCED", 540, 850, 26, colors.text, 700, "center");
      drawText(`MAP  /  ${data.poster.map.toUpperCase()}`, 540, 940, 22, colors.cyan, 700, "center");
      drawText(data.poster.slots, 540, 1000, 22, colors.cyan, 700, "center");
      if (data.poster.prize) drawText(fitText(`PRIZE POOL  /  ${data.poster.prize}`, 800, 23), 540, 1070, 23, colors.text, 800, "center");
      roundRect(220, 1130, 640, 70, 8, colors.cyan);
      drawText(fitText(data.poster.note || "REGISTER WITH ARENA X STAFF", 600, 20, 900), 540, 1174, 20, "#06121e", 900, "center");
    }

    ctx.fillStyle = colors.line;
    ctx.fillRect(60, 1780, 960, 2);
    drawText("ARENA X ESPORTS", 60, 1825, 20, colors.text, 900);
    drawText("PLAY FAIR. PLAY HARD.", 60, 1863, 15, colors.muted, 600);
    drawText("@ARENA X", 1020, 1825, 18, colors.cyan, 800, "right");
    drawText("OFFICIAL GRAPHICS", 1020, 1863, 14, colors.muted, 600, "right");

    canvas.toBlob((blob) => {
      if (!blob) {
        setNotice("PNG export failed. Please try again.");
        return;
      }
      downloadBlob(blob, `arena-x-${kind}-${Date.now()}.png`);
      setNotice("High-resolution PNG exported.");
    }, "image/png");
  }

  const activeTeams = active === "overall" ? overallRanked : matchRanked;

  return (
    <div className="studio">
      <aside className="sidebar">
        <button className="brand" onClick={() => setActive("dashboard")} aria-label="ARENA X home">
          <span className="brand-mark">AX</span>
          <span className="brand-copy">
            <strong>ARENA <b>X</b></strong>
            <small>GRAPHICS STUDIO</small>
          </span>
        </button>

        <div className="side-label">WORKSPACE</div>
        {tools.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${active === item.id ? "active" : ""}`}
            onClick={() => setActive(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.title}</span>
            {active === item.id && <span className="nav-active-mark" />}
          </button>
        ))}

        <div className="sidebar-spacer" />
        <div className="local-card">
          <span className="online-dot" />
          <div><strong>Local workspace</strong><small>Autosave enabled</small></div>
        </div>
        <button className="side-utility" onClick={exportJSON}>↓ Export workspace backup</button>
        <button className="side-utility" onClick={() => importRef.current?.click()}>↑ Restore from backup</button>
        <button className="side-utility danger" onClick={clearWorkspace}>Reset workspace</button>
        <input
          ref={importRef}
          className="hidden-input"
          type="file"
          accept=".json,application/json"
          onChange={(event) => void importJSON(event.target.files?.[0])}
        />
        <div className="side-footer">ARENA X ESPORTS <span>•</span> V1.0</div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">ARENA X <span>/</span> {currentTool.title}</div>
          <div className="topbar-right">
            <span className="save-indicator"><span /> Saved locally</span>
            <div className="staff-avatar">AX</div>
            <div className="staff-copy"><strong>Staff workspace</strong><small>Graphics manager</small></div>
          </div>
        </header>

        {active === "dashboard" ? (
          <div className="dashboard page-enter">
            <section className="hero">
              <div className="hero-copy">
                <div className="eyebrow"><span /> COMPETITIVE SERIES / CONTROL ROOM</div>
                <h1>MAKE EVERY<br /><em>MATCH COUNT.</em></h1>
                <p>One focused workspace for your scrims results, team slots and official tournament graphics.</p>
                <button className="primary-button hero-button" onClick={() => setActive("match")}>Create match graphic <span>↗</span></button>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="hero-orbit orbit-one" />
                <div className="hero-orbit orbit-two" />
                <div className="hero-ax">A<span>X</span></div>
                <div className="hero-art-caption">COMPETE<br />WITHOUT LIMITS</div>
              </div>
              <div className="hero-index">AX / 001</div>
            </section>

            <div className="section-heading">
              <div><div className="eyebrow">YOUR TOOLKIT</div><h2>Graphics workspace</h2></div>
              <span className="section-count">04 TOOLS</span>
            </div>

            <div className="tool-grid">
              {tools.filter((t) => t.id !== "dashboard").map((item, index) => (
                <button className="tool-card" key={item.id} onClick={() => setActive(item.id)}>
                  <div className="tool-card-head"><span className="tool-symbol">{item.icon}</span><span className="tool-index">0{index + 1}</span></div>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                  <div className="tool-open">Open workspace <span>↗</span></div>
                </button>
              ))}
            </div>

            <section className="dashboard-bottom">
              <div><div className="eyebrow">QUICK START</div><h3>From match data to official graphic.</h3><p>Enter the scores, check the ranking and export a post-ready PNG.</p></div>
              <button className="secondary-button" onClick={() => setActive("match")}>Open standings →</button>
            </section>
          </div>
        ) : (
          <div className="workspace-page page-enter">
            <div className="page-heading">
              <div><div className="eyebrow">ARENA X / STUDIO TOOLS</div><h1>{currentTool.title}</h1><p>{currentTool.desc}. Enter your data and export your graphic.</p></div>
              <span className="workspace-pill"><span /> EDITOR READY</span>
            </div>

            {active === "match" && (
              <>
                <div className="match-selector-bar" aria-label="Select match">
                  <div><span className="eyebrow">MATCH ARCHIVE</span><strong>Choose match</strong></div>
                  <div className="match-selector-buttons">{Array.from({ length: 6 }, (_, i) => i + 1).map((n) => <button key={n} className={matchIndex === n ? "match-select active" : "match-select"} onClick={() => switchMatch(n)}>MATCH {n}</button>)}</div>
                </div>
                <div className="match-settings panel">
                  <label className="field"><span>Graphic subtitle</span><input value={matchTitle} onChange={(e) => setMatchTitle(e.target.value)} placeholder={`MATCH ${matchIndex}`} /></label>
                  <div className="scoring-note"><span className="info-icon">i</span><span><strong>Scoring system</strong><small>1st: 12 · 2nd: 9 · 3rd: 8 · 4th: 7 · 5th: 6 · 6th: 5 · 7th: 4 · 8th: 3 · 9th: 2 · 10th: 1 · 11th–12th: 0. Each kill = 1 point.</small></span></div>
                  <button className="primary-button" onClick={() => exportGraphic("match")}>↓ Export standings PNG</button>
                </div>

                <div className="section-heading compact"><div><div className="eyebrow">INPUT DATA</div><h2>Team results</h2></div><button className="text-button" onClick={() => { updateData("teams", emptyTeams()); setNotice("Match data reset."); }}>Reset rows ↺</button></div>

                <div className="data-table panel">
                  <div className="table-header"><span>TEAM</span><span>PLACE</span><span>PP</span><span>KILLS</span><span>TOTAL</span></div>
                  {data.teams.map((team) => (
                    <div className="data-row" key={team.id}>
                      <input className="team-input" aria-label="Team name" value={team.name} onChange={(e) => updateTeam(team.id, "name", e.target.value)} placeholder={`Team ${team.id}`} />
                      <select aria-label="Placement" value={team.placement} onChange={(e) => updateTeam(team.id, "placement", e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option value={i + 1} key={i + 1}>{i + 1}{i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"}</option>)}</select>
                      <span className="score-number">{placementPoints(team.placement)}</span>
                      <input aria-label="Kill points" className="kills-input" type="number" min="0" max="999" value={team.kills} onChange={(e) => updateTeam(team.id, "kills", e.target.value)} />
                      <strong className="total-number">{placementPoints(team.placement) + team.kills}</strong>
                    </div>
                  ))}
                  <div className="table-foot"><span>{data.teams.filter((t) => t.name.trim()).length} teams entered</span><span>Totals calculate automatically</span></div>
                </div>

                <div className="section-heading compact"><div><div className="eyebrow">LIVE RANKING</div><h2>Standings preview</h2></div><span className="section-count">{matchRanked.length} TEAMS</span></div>
                <div className="rank-list panel">
                  <div className="rank-list-head"><span>#</span><span>TEAM NAME</span><span>PP</span><span>KP</span><span>PTS</span></div>
                  {matchRanked.length ? matchRanked.map((team, i) => (
                    <div className={`rank-list-row ${i < 3 ? `podium podium-${i + 1}` : ""}`} key={team.id}>
                      <span className="rank-number">{String(i + 1).padStart(2, "0")}</span><strong>{team.name}</strong><span>{team.pp}</span><span>{team.kp}</span><strong className="rank-total">{team.total}</strong>
                    </div>
                  )) : <div className="empty-state">Enter team names above to build the ranking.</div>}
                </div>
                <div className="export-bar"><div><strong>Ready to publish?</strong><small>1080 × 1920 · PNG · High resolution</small></div><button className="primary-button" onClick={() => exportGraphic("match")}>Download graphic ↓</button></div>
                <div className="section-heading compact"><div><div className="eyebrow">FINAL ARTWORK</div><h2>Reference-style preview</h2></div><span className="section-count">LIVE PREVIEW</span></div>
                <div className="poster-preview-wrap">
                  <div className="standings-poster-preview">
                    <div className="poster-shard poster-shard-left" /><div className="poster-shard poster-shard-right" />
                    <div className="poster-brand"><div className="poster-logo">A<span>X</span></div><strong>ARENA <b>X</b></strong><small>E S P O R T S</small></div>
                    <div className="poster-headline"><span>PER MATCH</span><strong>STANDINGS</strong></div>
                    <div className="poster-match-plate">{matchTitle || `MATCH ${matchIndex}`}</div>
                    <div className="poster-table">
                      <div className="poster-table-head"><span>RANK</span><span>TEAM NAME</span><span>PP</span><span>KP</span><span>TOTAL</span></div>
                      {Array.from({ length: 12 }, (_, i) => {
                        const team = matchRanked[i];
                        return <div className="poster-table-row" key={team?.id ?? `empty-${i}`}>
                          <span className={`poster-rank rank-${i + 1}`}><b>{i + 1}</b></span>
                          <strong className="poster-team-name">{team?.name?.trim() || "—"}</strong>
                          <span>{team ? team.pp : "—"}</span><span>{team ? team.kp : "—"}</span>
                          <strong className="poster-total">{team ? team.total : "—"}</strong>
                        </div>;
                      })}
                    </div>
                    <div className="poster-footer"><span>PLAY  /  COMPETE  /  BELONG</span><strong>ARENA X ESPORTS</strong></div>
                  </div>
                </div>
              </>
            )}

            {active === "slots" && (
              <div className="panel editor-panel">
                <div className="panel-title"><div><div className="eyebrow">LOBBY CONFIGURATION</div><h2>Build your slot list</h2></div><span className="section-count">{data.slotCount} SLOTS</span></div>
                <label className="field"><span>Lobby size</span><select value={data.slotCount} onChange={(e) => changeSlotCount(Number(e.target.value))}><option value={12}>12 slots</option><option value={18}>18 slots</option><option value={24}>24 slots</option><option value={48}>48 slots</option></select></label>
                <label className="field"><span>Bulk team names <small>One team per line, in slot order</small></span><textarea rows={9} value={data.slots.slice(0, data.slotCount).join("\n")} onChange={(e) => loadSlotNames(e.target.value)} placeholder={"Team Alpha\nTeam Bravo\nTeam Charlie"} /></label>
                <div className="slot-preview"><div className="eyebrow">ROSTER PREVIEW</div><div className="slot-preview-grid">{data.slots.slice(0, data.slotCount).map((name, i) => <div className="slot-preview-item" key={i}><span>{String(i + 1).padStart(2, "0")}</span><strong>{name.trim() || "Available slot"}</strong></div>)}</div></div>
                <div className="export-bar"><div><strong>Slot list graphic</strong><small>1080 × 1920 · PNG</small></div><button className="primary-button" onClick={() => exportGraphic("slots")}>Download slot list ↓</button></div>
              </div>
            )}

            {active === "overall" && (
              <div className="panel editor-panel">
                <div className="panel-title"><div><div className="eyebrow">TOURNAMENT TRACKER</div><h2>Overall standings</h2></div><span className="section-count">{data.overall.length} TEAMS</span></div>
                <div className="import-help"><strong>Quick import</strong><p>Paste one team per line: <code>Team Name, PP, KP</code>. PP and KP are cumulative scores across matches.</p></div>
                <textarea className="bulk-textarea" rows={5} id="overall-import" placeholder={"Team Alpha, 24, 15\nTeam Bravo, 19, 12"} />
                <button className="secondary-button" onClick={() => {
                  const field = document.getElementById("overall-import") as HTMLTextAreaElement | null;
                  const value = field?.value ?? "";
                  const parsed = value.split(/\r?\n/).map((line) => line.split(",").map((s) => s.trim())).filter((row) => row.length >= 3 && row[0]).map((row) => ({ id: uid(), name: row[0], pp: Math.max(0, Number(row[1]) || 0), kp: Math.max(0, Number(row[2]) || 0) }));
                  if (!parsed.length) { setNotice("No valid teams found in the pasted data."); return; }
                  updateData("overall", parsed); setNotice(`${parsed.length} teams imported.`);
                }}>Import teams</button>

                <div className="overall-edit-list">
                  {data.overall.map((team, i) => (
                    <div className="overall-edit-row" key={team.id}>
                      <span className="rank-number">{String(i + 1).padStart(2, "0")}</span>
                      <input aria-label="Overall team name" value={team.name} onChange={(e) => updateOverall(team.id, "name", e.target.value)} />
                      <label>PP<input aria-label="Overall PP" type="number" min="0" value={team.pp} onChange={(e) => updateOverall(team.id, "pp", e.target.value)} /></label>
                      <label>KP<input aria-label="Overall KP" type="number" min="0" value={team.kp} onChange={(e) => updateOverall(team.id, "kp", e.target.value)} /></label>
                      <strong>{totalFor(team)}</strong>
                    </div>
                  ))}
                </div>
                {data.overall.length > 0 && <button className="text-button" onClick={() => updateData("overall", [])}>Clear overall table</button>}
                <div className="export-bar"><div><strong>Overall leaderboard</strong><small>Ranked by cumulative total points</small></div><button className="primary-button" onClick={() => exportGraphic("overall")}>Download graphic ↓</button></div>
              </div>
            )}

            {active === "announce" && (
              <div className="panel editor-panel">
                <div className="panel-title"><div><div className="eyebrow">EVENT DESIGNER</div><h2>Scrims announcement</h2></div><span className="section-count">POSTER</span></div>
                <label className="field"><span>Announcement headline</span><input value={data.poster.title} onChange={(e) => updateData("poster", { ...data.poster, title: e.target.value })} placeholder="ARENA X SCRIMS" /></label>
                <div className="form-grid">
                  <label className="field"><span>Date</span><input value={data.poster.date} onChange={(e) => updateData("poster", { ...data.poster, date: e.target.value })} placeholder="25 OCT 2026" /></label>
                  <label className="field"><span>Time</span><input value={data.poster.time} onChange={(e) => updateData("poster", { ...data.poster, time: e.target.value })} placeholder="9:00 PM IST" /></label>
                  <label className="field"><span>Map</span><select value={data.poster.map} onChange={(e) => updateData("poster", { ...data.poster, map: e.target.value })}><option>Bermuda</option><option>Kalahari</option><option>Purgatory</option><option>Alpine</option><option>Nexterra</option><option>Mixed maps</option></select></label>
                  <label className="field"><span>Slots</span><select value={data.poster.slots} onChange={(e) => updateData("poster", { ...data.poster, slots: e.target.value })}><option>12 SLOTS</option><option>18 SLOTS</option><option>24 SLOTS</option><option>48 SLOTS</option></select></label>
                </div>
                <label className="field"><span>Prize pool (optional)</span><input value={data.poster.prize} onChange={(e) => updateData("poster", { ...data.poster, prize: e.target.value })} placeholder="e.g. ₹1,000" /></label>
                <label className="field"><span>Call to action</span><input value={data.poster.note} onChange={(e) => updateData("poster", { ...data.poster, note: e.target.value })} /></label>
                <div className="announcement-preview">
                  <div className="preview-ax">AX</div><p>ARENA X ESPORTS PRESENTS</p><h3>{data.poster.title || "ARENA X SCRIMS"}</h3><div className="preview-rule" /><strong>{data.poster.date || "DATE TBA"}</strong><strong>{data.poster.time || "TIME TBA"}</strong><span>{data.poster.map} · {data.poster.slots}</span>{data.poster.prize && <b>PRIZE POOL · {data.poster.prize}</b>}<div className="preview-cta">{data.poster.note || "REGISTER WITH ARENA X STAFF"}</div>
                </div>
                <div className="export-bar"><div><strong>Announcement poster</strong><small>1080 × 1920 · PNG</small></div><button className="primary-button" onClick={() => exportGraphic("announce")}>Download poster ↓</button></div>
              </div>
            )}
          </div>
        )}

        <footer className="main-footer"><span>ARENA X ESPORTS <i>/</i> GRAPHICS STUDIO</span><span>PLAY FAIR. PLAY HARD. <b>AX</b></span></footer>
      </main>

      {notice && <div className="toast" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")}>×</button></div>}
    </div>
  );
}

export default App;
