"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";
import * as THREE from "three";

type Status = "idle" | "loading" | "success" | "error";
type Step = 1 | 2 | 3 | 4;
type Receipt = { name: string; email: string; vibe: string; amount: string };

const TICKER = [
  "NVDA +2.4%",
  "BTC +1.1%",
  "AAPL -0.3%",
  "TSLA +4.7%",
  "ETH +0.9%",
  "MSFT +0.6%",
  "SOL +3.2%",
  "AMZN -0.8%",
  "you: still in bed",
];

const FEED: ReadonlyArray<readonly [string, string, string]> = [
  ["NVDA", "BUY", "earnings momentum"],
  ["BTC", "SELL", "took profit at resistance"],
  ["AAPL", "BUY", "dip into support"],
  ["TSLA", "SELL", "volatility spike, trimming"],
  ["ETH", "BUY", "breakout on volume"],
  ["MSFT", "BUY", "steady cash flow, adding"],
  ["SOL", "SELL", "cutting risk before news"],
  ["AMZN", "BUY", "post-earnings pullback"],
];

const BASE_PRICE: Record<string, number> = {
  NVDA: 118,
  BTC: 64200,
  AAPL: 226,
  TSLA: 248,
  ETH: 2650,
  MSFT: 420,
  SOL: 148,
  AMZN: 185,
};

const VIBES: ReadonlyArray<readonly [string, string]> = [
  ["Chill", "Slow and steady. Fewer surprises."],
  ["Balanced", "A mix of steady and bold."],
  ["Full send", "More active, bigger swings."],
];

const CHIPS: ReadonlyArray<readonly [string, string]> = [
  ["50", "$50"],
  ["100", "$100"],
  ["500", "$500"],
  ["1000", "$1,000"],
];

/* The heading is split into per-character spans by the split-text effect.
   It is memoised with no props so React never re-renders (and therefore
   never reconciles) the imperatively-built <span class="ch"> children. */
const HeroHeading = memo(function HeroHeading() {
  return (
    <h1 aria-label="your money works nights">
      <span className="ln" data-split>your money</span>
      <span className="ln serif" data-split>works</span>
      <span className="ln out">nights.</span>
    </h1>
  );
});

export default function Landing() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const heroCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const tickerRef = useRef<HTMLDivElement | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const profitRef = useRef<HTMLElement | null>(null);
  const amountRangeRef = useRef<HTMLInputElement | null>(null);
  const returnRangeRef = useRef<HTMLInputElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  const modalFormRef = useRef<HTMLFormElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const modalEmailRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const ackRef = useRef<HTMLInputElement | null>(null);

  const [okStatus, setOkStatus] = useState<Status>("idle");
  const [okMessage, setOkMessage] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("100");
  const [vibe, setVibe] = useState("");
  const [ack, setAck] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [receipt, setReceipt] = useState<Receipt>({
    name: "",
    email: "",
    vibe: "",
    amount: "100",
  });

  const closeModal = useCallback(() => setModalOpen(false), []);
  const openModal = useCallback(() => {
    setStep(1);
    setStatus("idle");
    setModalOpen(true);
  }, []);

  /* ---- split text + variable-font proximity ---------------------------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    pointerRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

    const chars: HTMLSpanElement[] = [];
    let index = 0;
    root.querySelectorAll<HTMLElement>("[data-split]").forEach((line) => {
      const text = line.textContent ?? "";
      line.textContent = "";
      text.split("").forEach((c) => {
        const span = document.createElement("span");
        span.className = "ch";
        span.style.setProperty("--i", String(index++));
        span.textContent = c === " " ? "\u00a0" : c;
        line.appendChild(span);
        chars.push(span);
      });
    });

    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      for (const span of chars) {
        const rect = span.getBoundingClientRect();
        const dist = Math.hypot(
          e.clientX - (rect.left + rect.width / 2),
          e.clientY - (rect.top + rect.height / 2),
        );
        const k = Math.max(0, 1 - dist / 260);
        span.style.fontVariationSettings =
          "'wght' " + Math.round(300 + 500 * k) + ",'wdth' " + Math.round(75 + 25 * k);
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  /* ---- ticker ---------------------------------------------------------- */
  useEffect(() => {
    const tk = tickerRef.current;
    if (!tk) return;
    let html = "";
    for (let r = 0; r < 4; r++) {
      TICKER.forEach((x) => {
        html += "<span>" + x + "</span>";
      });
    }
    tk.innerHTML = html;
  }, []);

  /* ---- card 3D tilt ---------------------------------------------------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".card"));
    const cleanups: Array<() => void> = [];
    cards.forEach((card) => {
      const onMove = (e: PointerEvent) => {
        const b = card.getBoundingClientRect();
        const x = (e.clientX - b.left) / b.width - 0.5;
        const y = (e.clientY - b.top) / b.height - 0.5;
        card.style.transform = "rotateY(" + x * 22 + "deg) rotateX(" + -y * 22 + "deg)";
      };
      const onLeave = () => {
        card.style.transform = "";
      };
      card.addEventListener("pointermove", onMove);
      card.addEventListener("pointerleave", onLeave);
      cleanups.push(() => {
        card.removeEventListener("pointermove", onMove);
        card.removeEventListener("pointerleave", onLeave);
      });
    });
    return () => cleanups.forEach((fn) => fn());
  }, []);

  /* ---- stat counters --------------------------------------------------- */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-to]"));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          const el = entry.target as HTMLElement;
          const to = Number(el.dataset.to);
          const start = performance.now();
          const frame = (now: number) => {
            const p = Math.min(1, (now - start) / 1200);
            el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
      },
      { threshold: 0.6 },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* ---- sample live trade feed ------------------------------------------ */
  useEffect(() => {
    const fl = feedRef.current;
    const pl = profitRef.current;
    if (!fl || !pl) return;
    const still = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    let pv = 1.42;

    const addT = () => {
      const d = FEED[Math.floor(Math.random() * FEED.length)];
      const px = BASE_PRICE[d[0]] * (1 + (Math.random() - 0.5) * 0.02);
      const q = (Math.random() * 4 + 0.2).toFixed(2);
      const row = document.createElement("div");
      const now = new Date();
      row.className = "tr";
      row.innerHTML =
        '<span class="bd ' + (d[1] === "BUY" ? "b" : "") + '">' + d[1].toLowerCase() + "</span>" +
        "<div><strong>" + d[0] + '</strong><em class="serif">' + d[2] + "</em></div>" +
        '<small class="mono">' + q + " @ $" +
        px.toLocaleString(undefined, { maximumFractionDigits: 2 }) + "<br>" +
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
        "</small>";
      fl.insertBefore(row, fl.firstChild);
      while (fl.children.length > 6) fl.removeChild(fl.lastChild!);
      pv += (Math.random() - 0.42) * 0.09;
      pl.textContent = (pv >= 0 ? "+" : "") + pv.toFixed(2) + "%";
    };

    for (let z = 0; z < 5; z++) addT();
    const id = window.setInterval(addT, still ? 6000 : 2600);
    return () => window.clearInterval(id);
  }, []);

  /* ---- pricing calculator ---------------------------------------------- */
  useEffect(() => {
    const root = rootRef.current;
    const ra = amountRangeRef.current;
    const rr = returnRangeRef.current;
    if (!root || !ra || !rr) return;
    const av = root.querySelector<HTMLElement>("#av");
    const rv = root.querySelector<HTMLElement>("#rv");
    const o1 = root.querySelector<HTMLElement>("#o1");
    const o2 = root.querySelector<HTMLElement>("#o2");
    const o3 = root.querySelector<HTMLElement>("#o3");
    if (!av || !rv || !o1 || !o2 || !o3) return;

    const money = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString();
    const calc = () => {
      const a = Number(ra.value);
      const r = Number(rr.value);
      const p = (a * r) / 100;
      const f = p > 0 ? p * 0.2 : 0;
      av.textContent = "$" + a.toLocaleString();
      rv.textContent = (r > 0 ? "+" : "") + r + "%";
      o1.textContent = (p > 0 ? "+" : "") + money(p);
      o2.textContent = money(f);
      o3.textContent = money(a + p - f);
    };
    ra.addEventListener("input", calc);
    rr.addEventListener("input", calc);
    calc();
    return () => {
      ra.removeEventListener("input", calc);
      rr.removeEventListener("input", calc);
    };
  }, []);

  /* ---- three.js scenes (hero + stacking coins) ------------------------- */
  useEffect(() => {
    const heroCanvas = heroCanvasRef.current;
    const stackCanvas = stackCanvasRef.current;
    if (!heroCanvas || !stackCanvas) return;

    const still = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    const cleanups: Array<() => void> = [];

    const setupHero = () => {
      const renderer = new THREE.WebGLRenderer({ canvas: heroCanvas, antialias: true, alpha: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      camera.position.z = 7;

      const wireMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
      const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const group = new THREE.Group();
      scene.add(group);

      const coreGeo = new THREE.IcosahedronGeometry(1.7, 1);
      const wireGeo = new THREE.IcosahedronGeometry(1.72, 1);
      const knotGeo = new THREE.TorusKnotGeometry(2.6, 0.05, 160, 8, 2, 3);
      const knotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const core = new THREE.Mesh(coreGeo, blackMat);
      const wire = new THREE.Mesh(wireGeo, wireMat);
      const knot = new THREE.Mesh(knotGeo, knotMat);
      group.add(core, wire, knot);

      const coins: THREE.Group[] = [];
      const coinGeos: THREE.BufferGeometry[] = [];
      const coinMats: THREE.Material[] = [];
      for (let k = 0; k < 6; k++) {
        const cn = new THREE.Group();
        const outerGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 28);
        const innerGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 28);
        const outerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        cn.add(new THREE.Mesh(outerGeo, outerMat), new THREE.Mesh(innerGeo, blackMat));
        cn.userData.a = (k / 6) * Math.PI * 2;
        group.add(cn);
        coins.push(cn);
        coinGeos.push(outerGeo, innerGeo);
        coinMats.push(outerMat);
      }

      const resize = () => {
        const w = heroCanvas.clientWidth;
        const h = heroCanvas.clientHeight;
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        group.position.x = w > 800 ? 2.4 : 0;
        group.position.y = w > 800 ? 0.3 : 1.6;
        group.scale.setScalar(w > 800 ? 1 : 0.7);
      };
      resize();
      window.addEventListener("resize", resize);

      let t = 0;
      let sy = 0;
      let raf = 0;
      const loop = () => {
        t += 0.01;
        sy += (window.scrollY - sy) * 0.08;
        const p = pointerRef.current;
        group.rotation.y = t * 0.6 + sy * 0.004 + (p.x / window.innerWidth - 0.5) * 1.2;
        group.rotation.x = (p.y / window.innerHeight - 0.5) * 0.8 + sy * 0.001;
        knot.rotation.z = t;
        coins.forEach((c, j) => {
          const a = (c.userData as { a: number }).a + t * 0.8;
          c.position.set(Math.cos(a) * 3.3, Math.sin(a * 1.3) * 1.4, Math.sin(a) * 3.3);
          c.rotation.x = t * 2 + j;
          c.rotation.z = t + j;
        });
        renderer.render(scene, camera);
        if (!still) raf = requestAnimationFrame(loop);
      };
      loop();
      if (still) renderer.render(scene, camera);

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        coreGeo.dispose();
        wireGeo.dispose();
        knotGeo.dispose();
        coinGeos.forEach((g) => g.dispose());
        wireMat.dispose();
        blackMat.dispose();
        knotMat.dispose();
        coinMats.forEach((m) => m.dispose());
        renderer.dispose();
      };
    };

    const setupStack = () => {
      const renderer = new THREE.WebGLRenderer({ canvas: stackCanvas, antialias: true, alpha: true });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
      camera.position.set(0, 1.5, 9);
      camera.lookAt(0, 0.6, 0);

      const blackMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const group = new THREE.Group();
      scene.add(group);

      const geos: THREE.BufferGeometry[] = [];
      for (let q = 0; q < 10; q++) {
        const cg = new THREE.Group();
        const g1 = new THREE.CylinderGeometry(1.5, 1.5, 0.28, 40);
        const g2 = new THREE.CylinderGeometry(1.15, 1.15, 0.3, 40);
        const g3 = new THREE.CylinderGeometry(1.05, 1.05, 0.32, 40);
        cg.add(new THREE.Mesh(g1, blackMat), new THREE.Mesh(g2, whiteMat), new THREE.Mesh(g3, blackMat));
        cg.position.y = q * 0.36 - 1.6;
        cg.userData.o = q;
        group.add(cg);
        geos.push(g1, g2, g3);
      }

      const ringGeo = new THREE.TorusGeometry(2.9, 0.04, 8, 90);
      const ring2Geo = new THREE.TorusGeometry(2.4, 0.04, 8, 90);
      const ring = new THREE.Mesh(ringGeo, blackMat);
      const ring2 = new THREE.Mesh(ring2Geo, blackMat);
      ring.rotation.x = 1.2;
      ring2.rotation.x = 1.2;
      ring2.rotation.y = 0.7;
      group.add(ring, ring2);
      geos.push(ringGeo, ring2Geo);

      const resize = () => {
        const w = stackCanvas.clientWidth;
        const h = stackCanvas.clientHeight;
        renderer.setSize(w, h, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      window.addEventListener("resize", resize);

      let raf = 0;
      const loop = () => {
        const b = stackCanvas.getBoundingClientRect();
        if (b.bottom > 0 && b.top < window.innerHeight) {
          const p2 = (window.innerHeight - b.top) / (window.innerHeight + b.height);
          const tt = performance.now() * 0.001;
          group.children.forEach((o) => {
            const data = o.userData as { o?: number };
            if (data.o !== undefined) {
              o.rotation.y = p2 * 3 + data.o * 0.35;
              o.position.x = Math.sin(tt + data.o * 0.6) * 0.25 * p2 * 3;
            }
          });
          ring.rotation.z = tt * 0.5;
          ring2.rotation.z = -tt * 0.7;
          const p = pointerRef.current;
          group.rotation.y = tt * 0.3 + (p.x / window.innerWidth - 0.5) * 0.6;
          renderer.render(scene, camera);
        }
        if (!still) raf = requestAnimationFrame(loop);
      };
      loop();

      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
        geos.forEach((g) => g.dispose());
        blackMat.dispose();
        whiteMat.dispose();
        renderer.dispose();
      };
    };

    try {
      cleanups.push(setupHero());
    } catch {
      /* WebGL unavailable — skip the hero scene */
    }
    try {
      cleanups.push(setupStack());
    } catch {
      /* WebGL unavailable — skip the stacking scene */
    }
    return () => cleanups.forEach((fn) => fn());
  }, []);

  /* ---- modal: body scroll lock ----------------------------------------- */
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [modalOpen]);

  /* ---- modal: escape to close ------------------------------------------ */
  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen, closeModal]);

  /* ---- handlers -------------------------------------------------------- */
  const goNext = () => {
    const nameOk = nameRef.current?.reportValidity() ?? false;
    const emailOk = modalEmailRef.current?.reportValidity() ?? false;
    if (nameOk && emailOk) setStep(2);
  };

  const chooseVibe = (v: string) => {
    setVibe(v);
    setStep(3);
  };

  const goBack = () => setStep((s) => (s > 1 ? ((s - 1) as Step) : s));

  const retry = () => {
    setStatus("idle");
    setStep(3);
  };

  const handleOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal();
  };

  const onSmallSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = emailInputRef.current;
    if (!input || !input.reportValidity()) return;
    const value = input.value.trim();
    if (!value) return;

    setOkStatus("loading");
    setOkMessage("joining\u2026");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      if (!res.ok) throw new Error("request failed");
      input.value = "";
      setOkStatus("success");
      setOkMessage("you're on the list. we'll email " + value + " when your spot opens.");
      setEmail(value);
      openModal();
    } catch {
      setOkStatus("error");
      setOkMessage(
        "we couldn't save that just now \u2014 that's on our end, not yours. please try again in a moment.",
      );
    }
  };

  const handleModalSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (step === 1) {
      goNext();
      return;
    }
    if (step !== 3) return;
    if (!modalFormRef.current?.reportValidity()) return;

    const payload: Receipt = { name: name.trim(), email: email.trim(), vibe, amount };
    setStatus("loading");
    setStep(4);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("request failed");
      setReceipt(payload);
      setStatus("success");
      // mirrors the original `mf.reset()`
      setName("");
      setEmail("");
      setAmount("100");
      setVibe("");
      setAck(false);
    } catch {
      setStatus("error");
    }
  };

  let step4Heading = "";
  let step4Body = "";
  if (status === "loading") {
    step4Heading = "saving\u2026";
    step4Body = "one moment while we save your spot.";
  } else if (status === "error") {
    step4Heading = "that didn't go through.";
    step4Body =
      "we couldn't save your spot just now \u2014 that's on our end, not yours. please try again in a moment.";
  } else if (status === "success") {
    step4Heading = "you're in, " + receipt.name + ".";
    step4Body =
      "Vibe: " + receipt.vibe + ". Starting amount: $" + Number(receipt.amount).toLocaleString() +
      ". We'll email " + receipt.email + " the moment your spot opens.";
  }

  return (
    <div ref={rootRef}>
      <nav><b>stacked.</b><span className="nl"><Link className="bare" href="/signin">sign in</Link><Link href="/signup">sign up</Link></span></nav>

      <header className="hero">
        <canvas id="c" ref={heroCanvasRef} aria-hidden="true" />
        <HeroHeading />
        <p className="sub">Drop in any amount. Our traders do the trading. You watch it all live, no jargon, no gatekeeping.</p>
        <div className="cta"><Link className="btn" href="/signup">get early access</Link><a className="btn ghost" href="#how">how it works</a></div>
      </header>

      <div className="tick mono" aria-hidden="true"><div id="tk" ref={tickerRef}></div></div>

      <section className="inv" id="how">
        <h2>3 steps.<br /><span className="serif">that&apos;s it.</span></h2>
        <div className="cards">
          <div className="card"><div className="n">1</div><div><h3>Sign up</h3><p>Two minutes. Verify who you are, tell us how much risk you&apos;re cool with.</p></div></div>
          <div className="card"><div className="n">2</div><div><h3>Fund it</h3><p>Transfer any amount you choose. Your money stays in your name.</p></div></div>
          <div className="card"><div className="n">3</div><div><h3>Watch us trade</h3><p>Every trade shows up in your feed. Withdraw when you want.</p></div></div>
        </div>
      </section>

      <section className="stats">
        <div className="stat"><b data-to="24">0</b><span className="serif">hours a day you can check in</span></div>
        <div className="stat"><b data-to="100">0</b><span className="serif">% of trades visible to you</span></div>
        <div className="stat"><b data-to="0">9</b><span className="serif">hidden fees. none. zero.</span></div>
      </section>

      <section className="inv man" id="why">
        <div>
          <h2>why this<br /><span className="serif">exists.</span></h2>
          <p>Your uncle has a hot tip. Your timeline has a guy selling a course. Meanwhile your money sits in an account doing basically nothing.</p>
          <p>Trading is a full-time job, and you already have one. Or a degree. Or a side hustle. Or all three. So a real team trades, and you get the receipts.</p>
          <p className="serif">If we can&apos;t explain a trade in one sentence, we shouldn&apos;t be making it.</p>
        </div>
        <canvas id="c2" ref={stackCanvasRef} aria-hidden="true"></canvas>
      </section>

      <section className="vibe" id="vibe">
        <div>
          <h2>pick your <span className="serif">vibe.</span></h2>
          <p style={{ fontSize: "20px", maxWidth: "480px", lineHeight: 1.4, margin: 0 }}>You choose how much risk feels right when you sign up. You can change it later. Higher risk means bigger swings in both directions.</p>
          <dl>
            <dt>Chill</dt><dd>Slow and steady. Smaller moves, fewer surprises. For money you don&apos;t want to stress about.</dd>
            <dt>Balanced</dt><dd>A mix of steady positions and bolder ones. The middle path for most people.</dd>
            <dt>Full send</dt><dd>More active, more volatile. Only put in what you can stomach watching go up and down.</dd>
          </dl>
        </div>
        <div className="stage" aria-hidden="true"><div className="cube"><div className="face f1">chill</div><div className="face f2">balanced</div><div className="face f3">full send</div><div className="face f4">your call</div></div></div>
      </section>

      <section className="inv fd" id="live">
        <div>
          <h2>watch it<br /><span className="serif">live.</span></h2>
          <p>Every move we make with your money shows up here as it happens: what we bought or sold, how much, and why.</p>
          <p className="serif" style={{ fontSize: "34px", lineHeight: 1.05 }}>no black box. just receipts.</p>
        </div>
        <div className="pn" role="log" aria-label="Sample live trade feed">
          <div className="ph"><div><span style={{ textAlign: "left", display: "block", marginBottom: "6px" }}>your account today</span><b id="pl" ref={profitRef}>+1.42%</b></div><span className="mono">sample data,<br />not real trades</span></div>
          <div id="fl" ref={feedRef}></div>
        </div>
      </section>

      <section className="trust" id="trust">
        <h2>trust is <span className="serif">the product.</span></h2>
        <div className="tg">
          <div><h3>Your name, your account</h3><p>Your funds are held in an account under your name, not ours. We trade it, we don&apos;t own it.</p></div>
          <div><h3>Every trade, receipted</h3><p>Each buy and sell lands in your feed with the what, when and why. No black box.</p></div>
          <div><h3>Leave whenever</h3><p>No lock-ins, no exit drama. Request a withdrawal any time.</p></div>
          <div><h3>Real talk on risk</h3><p>We&apos;ll show you the down days as clearly as the good ones. Losses are possible, and we&apos;ll never pretend otherwise.</p></div>
        </div>
      </section>

      <section className="faq" id="faq">
        <h2>questions,<br /><span className="serif">answered.</span></h2>
        <details><summary>Can I lose money?</summary><p>Yes. All trading carries risk and you can lose some or all of what you put in. Nobody can promise returns, and we won&apos;t.</p></details>
        <details><summary>Who&apos;s actually trading my money?</summary><p>A team of traders working within the risk level you pick. You&apos;ll see who they are and how they trade before you fund anything.</p></details>
        <details><summary>How much do I need to start?</summary><p>You decide the amount. We&apos;ll publish the minimum at launch so there are no surprises.</p></details>
        <details><summary>How do you make money?</summary><p>Through a clear fee that&apos;s shown up front, before you deposit. No hidden charges, ever.</p></details>
        <details><summary>How do I get my money out?</summary><p>Tap withdraw in the app and choose the amount. We&apos;ll show you the timeline before you confirm.</p></details>
      </section>

      <section className="price" id="pricing">
        <h2>what it<br /><span className="serif">costs.</span></h2>
        <div className="pc">
          <div className="pk"><h3>Join</h3><b>$0</b><p>No sign-up fee and no monthly subscription.</p></div>
          <div className="pk hot"><h3>Trade</h3><b>20%</b><p>Of profits only, and only when there are profits. No profit, no fee.</p></div>
          <div className="pk"><h3>Withdraw</h3><b>$0</b><p>Take your money out any time. We don&apos;t charge you to leave.</p></div>
        </div>
        <div className="calc">
          <div>
            <h3 className="serif">try the math</h3>
            <label>you put in <b id="av">$500</b><input type="range" id="ra" ref={amountRangeRef} min="50" max="10000" step="50" defaultValue="500" aria-label="Amount invested" /></label>
            <label>hypothetical return <b id="rv">+10%</b><input type="range" id="rr" ref={returnRangeRef} min="-30" max="50" step="1" defaultValue="10" aria-label="Hypothetical return percent" /></label>
          </div>
          <div className="rs">
            <div><span>profit or loss</span><span id="o1"></span></div>
            <div><span>our fee</span><span id="o2"></span></div>
            <div><span>you keep</span><span id="o3"></span></div>
          </div>
        </div>
        <p className="note mono">This is an example, not a forecast. Returns aren&apos;t guaranteed and you can lose money. The 20% fee is a placeholder until final terms are set.</p>
      </section>

      <section className="end" id="join">
        <h2>get in <span className="serif">early.</span></h2>
        <form id="f" onSubmit={onSmallSubmit}><input type="email" id="em" ref={emailInputRef} placeholder="you@email.com" required aria-label="Email" /><button className="btn" type="submit">join waitlist</button></form>
        <div id="ok" className="serif" role="status" aria-busy={okStatus === "loading"}>{okMessage}</div>
        <p className="mono" style={{ fontSize: "15px", opacity: 0.75, margin: "26px 0 0" }}>ready for the full thing? <Link href="/signup" style={{ color: "#fff" }}>create an account</Link> or <Link href="/signin" style={{ color: "#fff" }}>sign in</Link>.</p>
      </section>

      <footer className="mono">Investing involves risk, including loss of your capital. Past performance doesn&apos;t guarantee future results. Numbers on this page are placeholders. Stacked is not yet a registered investment manager.</footer>

      <div id="m" hidden={!modalOpen} role="dialog" aria-modal="true" aria-label="Join the waitlist" onClick={handleOverlayClick}><div className="mb">
        <div className="pg">{[0, 1, 2, 3].map((j) => <i key={j} className={j < step ? "on" : ""}></i>)}</div>
        <form id="mf" ref={modalFormRef} noValidate onSubmit={handleModalSubmit}>
          <div className="stp" data-s="1" hidden={step !== 1}><h3>let&apos;s get you in.</h3>
            <label>your name<input ref={nameRef} type="text" name="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></label>
            <label>email<input ref={modalEmailRef} type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
            <div className="mrow"><button className="btn" type="button" data-a="n1" onClick={goNext}>next</button><button className="lnk" type="button" data-a="x" onClick={closeModal}>cancel</button></div></div>
          <div className="stp" data-s="2" hidden={step !== 2}><h3>pick your vibe.</h3>
            {VIBES.map(([v, blurb]) => (
              <button key={v} className="vb" type="button" data-a="v" data-v={v} onClick={() => chooseVibe(v)}>{v}<small>{blurb}</small></button>
            ))}
            <div className="mrow"><button className="lnk" type="button" data-a="b" onClick={goBack}>back</button></div></div>
          <div className="stp" data-s="3" hidden={step !== 3}><h3>how much to start?</h3>
            <label>amount in USD<input ref={amountRef} type="number" name="amt" min="1" step="1" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <div className="chips">{CHIPS.map(([v, label]) => <button key={v} className="chip" type="button" data-a="chip" data-v={v} onClick={() => setAmount(v)}>{label}</button>)}</div>
            <label className="ck"><input ref={ackRef} type="checkbox" name="ack" required checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>I understand trading involves risk and I can lose some or all of my money.</span></label>
            <div className="mrow"><button className="btn" type="submit">join waitlist</button><button className="lnk" type="button" data-a="b" onClick={goBack}>back</button></div></div>
          <div className="stp" data-s="4" hidden={step !== 4}><h3 className="serif" id="dn">{step4Heading}</h3><p id="ds" style={{ fontSize: "19px", lineHeight: 1.4 }}>{step4Body}</p>
            <div className="mrow"><Link className="btn" href="/signup" style={{ textDecoration: "none" }}>create my account</Link>{status === "error" && <button className="lnk" type="button" data-a="b" onClick={retry}>try again</button>}<button className="lnk" type="button" data-a="x" onClick={closeModal}>done</button></div></div>
        </form>
      </div></div>
    </div>
  );
}
