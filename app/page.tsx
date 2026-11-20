'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';

// Terrain 3D (three.js) chargé uniquement côté client, dans son propre bundle.
const CourtReplay = dynamic(() => import('./CourtReplay'), { ssr: false });

/* ---------------------------------------------------------------- */
/* Shared pieces                                                     */
/* ---------------------------------------------------------------- */

// Visuel du hero (généré avec ChatGPT). Si tu ajoutes public/videos/hero.mp4, la vidéo remplace l'image ;
// sinon l'image reste affichée (poster).
// Préfixe de chemin (GitHub Pages sert le site sous /heroscore ; vide en local et sur Vercel).
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const HERO_IMAGE = `${BASE}/images/hero.jpg`;
const HERO_VIDEO = `${BASE}/videos/hero.mp4`;

/**
 * Image/vidéo de fond avec zoom lent + parallax 3D qui suit la souris.
 * - Le parallax écrit directement le style (pas de re-render React à chaque mouvement de souris).
 * - Désactivé sur écran tactile et si prefers-reduced-motion.
 * - La vidéo n'est lue que lorsqu'elle est visible (4 instances sur la page).
 */
function ParallaxMedia({ focus = '70% 50%', zoom = 1, className = '' }: { focus?: string; zoom?: number; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const setT = (x: number, y: number) => {
      layer.style.transform = `translate3d(${x * -24}px, ${y * -16}px, 0) rotateY(${x * 3}deg) rotateX(${y * -2}deg) scale(${zoom})`;
    };
    setT(0, 0);
    const still = window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches;
    if (still) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    const onMove = (e: MouseEvent) => {
      x = e.clientX / window.innerWidth - 0.5;
      y = e.clientY / window.innerHeight - 0.5;
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          setT(x, y);
        });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMove);
    };
  }, [zoom]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const video = videoRef.current;
    if (!wrap || !video) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause();
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
    io.observe(wrap);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrapRef} aria-hidden className={`absolute inset-0 overflow-hidden [perspective:1200px] ${className}`}>
      <div ref={layerRef} className="absolute -inset-[6%] transition-transform duration-700 ease-out">
        <video
          ref={videoRef}
          className="h-full w-full animate-[kenburns_24s_ease-in-out_infinite_alternate] object-cover motion-reduce:animate-none"
          style={{ objectPosition: focus }}
          src={HERO_VIDEO}
          poster={HERO_IMAGE}
          muted
          loop
          playsInline
          preload="metadata"
        />
      </div>
    </div>
  );
}

function FadeInUp({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-1000 ease-out motion-reduce:translate-y-0! motion-reduce:opacity-100! motion-reduce:blur-none! ${
        visible ? 'translate-y-0 opacity-100 blur-none' : 'translate-y-10 opacity-0 blur-sm'
      } ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Motion au scroll                                                  */
/* ---------------------------------------------------------------- */

const clamp = (v: number) => Math.min(1, Math.max(0, v));

type ScrollFx<T> = (el: T, rect: DOMRect, vh: number) => void;

/**
 * Applique un effet lié au scroll directement sur le style de l'élément (pas de re-render React).
 * `fx` doit être une fonction stable (définie hors composant). Désactivé si prefers-reduced-motion.
 */
function useScrollFx<T extends HTMLElement>(fx: ScrollFx<T>) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      fx(el, el.getBoundingClientRect(), window.innerHeight);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [fx]);
  return ref;
}

// Barre de progression de lecture (en haut de la page).
const progressFx: ScrollFx<HTMLDivElement> = (el) => {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  el.style.transform = `scaleX(${max > 0 ? clamp(window.scrollY / max) : 0})`;
};

// Hero : le texte monte et s'efface, le fond zoome légèrement.
const heroContentFx: ScrollFx<HTMLDivElement> = (el, _r, vh) => {
  const t = clamp(window.scrollY / vh);
  el.style.transform = `translate3d(0, ${t * 140}px, 0)`;
  el.style.opacity = String(1 - t * 1.3);
};
const heroBgFx: ScrollFx<HTMLDivElement> = (el, _r, vh) => {
  const t = clamp(window.scrollY / vh);
  el.style.transform = `scale(${1 + t * 0.15})`;
};

// Mockups vidéo : se redressent (inclinaison 3D → à plat) en entrant dans l'écran.
const tiltInFx: ScrollFx<HTMLDivElement> = (el, r, vh) => {
  const p = clamp((vh - r.top) / (vh * 0.75));
  el.style.transform = `perspective(1200px) rotateX(${(1 - p) * 14}deg) scale(${0.88 + p * 0.12})`;
  el.style.opacity = String(0.35 + p * 0.65);
};

// Ligne "How it works" : se remplit en bleu au fil du scroll.
const lineFillFx: ScrollFx<HTMLDivElement> = (el, r, vh) => {
  el.style.transform = `scaleX(${clamp((vh * 0.9 - r.top) / (vh * 0.5))})`;
};

function ScrollProgress() {
  const ref = useScrollFx(progressFx);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5">
      <div ref={ref} className="h-full origin-left scale-x-0 bg-gradient-to-r from-brand-blue to-white" />
    </div>
  );
}

function Logo({ className = 'h-14 w-auto' }: { className?: string }) {
  // Logo HeroScore (blanc, fond transparent) : public/images/logo.png
  return <img src={`${BASE}/images/logo.png`} alt="HeroScore" className={className} />;
}

function PrimaryButton({ children, href = '#contact' }: { children: ReactNode; href?: string }) {
  return (
    <a href={href} className="rounded-full bg-white px-6 py-3 text-sm font-medium text-black transition-colors hover:bg-gray-200">
      {children}
    </a>
  );
}

function SecondaryButton({ children, href = '#features' }: { children: ReactNode; href?: string }) {
  return (
    <a
      href={href}
      className="rounded-full border border-white/5 bg-[#1F1F22] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[#2A2A2D]"
    >
      {children}
    </a>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="mb-6 inline-flex rounded-full border border-brand-blue/60 bg-brand-blue/20 px-3 py-1.5 text-xs font-medium text-white">
      ✨ {children}
    </span>
  );
}

/* ---------------------------------------------------------------- */
/* 1. Navigation                                                     */
/* ---------------------------------------------------------------- */

const NAV = [
  { label: 'About', href: '#about' },
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: '3D replay', href: '#replay' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open ? 'bg-black/80 backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <a href="#top" className="flex items-center text-white" aria-label="HeroScore – back to top">
          <Logo />
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((l) => (
            <a key={l.href} href={l.href} className="text-sm font-medium text-gray-300 transition-colors hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>

        <a
          href="#contact"
          className="hidden rounded-full border border-white/5 bg-[#1F1F22] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2A2A2D] md:inline-flex"
        >
          Request a demo
        </a>

        <button
          className="flex h-10 w-10 items-center justify-center rounded-full text-white md:hidden"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={open}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-300 md:hidden ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="flex flex-col gap-1 px-6 pb-6">
            {NAV.map((l) => (
              <button
                key={l.href}
                onClick={() => go(l.href)}
                className="rounded-lg px-2 py-3 text-left text-base font-medium text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </button>
            ))}
            <button onClick={() => go('#contact')} className="mt-2 rounded-full bg-white px-5 py-3 text-sm font-medium text-black">
              Request a demo
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------- */
/* 2. Hero                                                           */
/* ---------------------------------------------------------------- */

const SPORTS_TECH = [
  { name: 'Padel', icon: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M4 12h16" /></> },
  { name: 'Football', icon: <><circle cx="12" cy="12" r="8" /><path d="M12 8l3 2.2-1.1 3.6h-3.8L9 10.2z" /></> },
  { name: 'Basketball', icon: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4v16M6.5 6.5c3 3 3 8 0 11M17.5 6.5c-3 3-3 8 0 11" /></> },
  { name: 'Computer Vision', icon: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  { name: 'Deep Learning', icon: <><circle cx="5" cy="7" r="2" /><circle cx="5" cy="17" r="2" /><circle cx="19" cy="12" r="2" /><path d="M7 7l10 5M7 17l10-5" /></> },
];

function Hero() {
  const items = [...SPORTS_TECH, ...SPORTS_TECH, ...SPORTS_TECH, ...SPORTS_TECH];
  const contentRef = useScrollFx(heroContentFx);
  const bgRef = useScrollFx(heroBgFx);
  return (
    <section id="top" className="relative z-0 flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-32">
      <div ref={bgRef} className="absolute inset-0 -z-10 will-change-transform">
        <ParallaxMedia className="opacity-90" />
      </div>
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/30 to-black" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.75)_0%,rgba(0,0,0,0.35)_45%,transparent_75%)]" />

      <div ref={contentRef} className="flex w-full flex-col items-center will-change-transform">
      <FadeInUp className="flex flex-col items-center">
        <span className="mb-8 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-300 backdrop-blur-sm">
          ✨ Now focused on padel in Tunisia
        </span>
      </FadeInUp>

      <FadeInUp delay={100}>
        <h1 className="mb-6 text-center text-5xl font-medium tracking-tight md:text-7xl">
          Making sports
          <br />
          <span className="font-serif font-normal italic">intelligent.</span>
        </h1>
      </FadeInUp>

      <FadeInUp delay={200}>
        <p className="mx-auto max-w-2xl text-center text-[17px] leading-relaxed text-gray-300">
          HeroScore builds computer vision for sport. Our first product, <span className="text-white">SmartPlay</span>, turns a
          single padel match video into player tracking, heatmaps and movement stats.
        </p>
      </FadeInUp>

      <FadeInUp delay={300} className="mt-10 flex flex-row flex-wrap justify-center gap-3">
        <PrimaryButton>Request a demo</PrimaryButton>
        <SecondaryButton href="#how">See how it works</SecondaryButton>
      </FadeInUp>

      <FadeInUp delay={400} className="w-full">
        <p className="mb-8 mt-24 text-center text-sm font-medium text-gray-500">Built across sports, powered by AI</p>
        <div
          className="mx-auto w-full max-w-5xl overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
          }}
        >
          <p className="sr-only">{SPORTS_TECH.map((s) => s.name).join(', ')}</p>
          <div aria-hidden className="flex w-max animate-[marquee_30s_linear_infinite] motion-reduce:animate-none">
            {items.map((b, i) => (
              <div key={i} className="flex flex-shrink-0 items-center gap-2.5 px-8 text-gray-400">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  {b.icon}
                </svg>
                <span className="whitespace-nowrap text-lg font-semibold tracking-tight">{b.name}</span>
              </div>
            ))}
          </div>
        </div>
      </FadeInUp>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 2b. About (histoire, mission, équipe)                             */
/* ---------------------------------------------------------------- */

const STORY = [
  {
    k: 'Explore',
    title: 'AI across three sports',
    text: 'We started by testing computer vision on football, basketball and padel, to learn what video alone can reliably measure.',
  },
  {
    k: 'Focus',
    title: 'Padel, in Tunisia',
    text: 'Padel is growing fast in Tunisia, and most players and clubs still have no data on their game. That is where we put our resources.',
  },
  {
    k: 'Build',
    title: 'SmartPlay',
    text: 'Our first product: one fixed camera, one match video, and an analysis of every player and rally. Working prototype, open to pilots.',
  },
];

const PRINCIPLES = [
  { title: 'Video only', text: 'No sensors or wearables. A single fixed camera is enough.' },
  { title: 'Honest about status', text: 'We label every feature as prototype or coming soon until it is proven.' },
  { title: 'Your footage stays yours', text: 'Match videos are used only to produce your analysis.' },
];

// Profils : compléter les rôles / liens dès qu'ils sont validés (voir CLAUDE.md « À faire »).
const TEAM = [
  { name: 'Aymen Kamel', role: 'Co-founder', initials: 'AK' },
  { name: 'Racem Dammak', role: 'Co-founder', initials: 'RD' },
];

function About() {
  return (
    <section id="about" className="mx-auto max-w-7xl px-6 py-24">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
        <FadeInUp>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-gray-500">About HeroScore</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Sport data for everyone, <span className="font-serif font-normal italic">not just the pros.</span>
          </h2>
          <p className="mt-6 max-w-md leading-relaxed text-gray-400">
            Professional teams have analysts and tracking systems. Club players and coaches have a phone and a feeling. HeroScore
            is a Tunisian SportTech &amp; AI startup closing that gap with computer vision, starting with padel.
          </p>
        </FadeInUp>

        <ol className="relative space-y-4 border-l border-white/10 pl-8">
          {STORY.map((s, i) => (
            <FadeInUp key={s.k} delay={i * 100}>
              <li className="relative">
                <span className="absolute -left-[37px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-blue ring-4 ring-black" />
                <p className="font-serif text-lg italic text-white/40">{s.k}</p>
                <h3 className="mt-1 text-lg font-medium text-white">{s.title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">{s.text}</p>
              </li>
            </FadeInUp>
          ))}
        </ol>
      </div>

      <div className="mt-20 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-3">
        {PRINCIPLES.map((p, i) => (
          <FadeInUp key={p.title} delay={i * 80} className="h-full">
            <div className="h-full bg-black p-6">
              <h3 className="text-base font-medium text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{p.text}</p>
            </div>
          </FadeInUp>
        ))}
      </div>

      <FadeInUp className="mt-20">
        <h3 className="text-center text-sm font-medium uppercase tracking-[0.2em] text-gray-500">The team</h3>
        <ul className="mx-auto mt-8 grid max-w-2xl gap-4 sm:grid-cols-2">
          {TEAM.map((m) => (
            <li key={m.name} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-[#0A0A0B] p-5">
              <span
                aria-hidden
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border border-brand-blue/60 bg-brand-blue/25 font-serif text-xl italic text-white"
              >
                {m.initials}
              </span>
              <div>
                <p className="font-medium text-white">{m.name}</p>
                <p className="text-sm text-gray-400">{m.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </FadeInUp>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 3. How it works (pipeline SmartPlay du PFE)                       */
/* ---------------------------------------------------------------- */

const STEPS = [
  {
    n: '01',
    title: 'Film the match',
    text: 'One fixed camera, placed high behind the court, filming the whole game. Upload the video once the match is over.',
  },
  {
    n: '02',
    title: 'Map the court',
    text: 'SmartPlay locates 12 reference points on the court lines and maps the image onto a real 10 m × 20 m padel court, so every position is measured in metres.',
  },
  {
    n: '03',
    title: 'Track players and ball',
    text: 'The four players keep stable IDs, even when they cross at the net. Their feet are located on the ground, and the ball is followed over 8-frame windows, even when it blurs.',
  },
  {
    n: '04',
    title: 'Read the match',
    text: 'You get an annotated video, a dashboard with a card per player and heatmaps, and a CSV file with the full frame-by-frame data.',
  },
];

function HowItWorks() {
  const lineRef = useScrollFx(lineFillFx);
  return (
    <section id="how" className="mx-auto max-w-7xl px-6 py-24">
      <FadeInUp className="mx-auto max-w-2xl text-center">
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">
          How <span className="font-serif font-normal italic">SmartPlay</span> works
        </h2>
        <p className="mt-6 text-gray-400">From one match video to numbers you can coach with, in four steps.</p>
      </FadeInUp>
      <div className="mt-16 h-px w-full bg-white/10">
        <div ref={lineRef} className="h-full origin-left scale-x-0 bg-gradient-to-r from-brand-blue via-brand-blue to-white/60" />
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <FadeInUp key={s.n} delay={i * 100} className="h-full">
            <div className="relative h-full rounded-2xl border border-white/10 bg-[#0A0A0B] p-6">
              <span className="font-serif text-4xl italic text-white/30">{s.n}</span>
              <h3 className="mt-6 text-lg font-medium text-white">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-gray-400">{s.text}</p>
              <span className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue to-transparent" />
            </div>
          </FadeInUp>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 4 & 5. Features                                                   */
/* ---------------------------------------------------------------- */

function VideoMockup({ focus, zoom, children }: { focus: string; zoom: number; children: ReactNode }) {
  const ref = useScrollFx(tiltInFx);
  return (
    <div ref={ref} className="relative flex min-h-[420px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 p-8 will-change-transform">
      <ParallaxMedia focus={focus} zoom={zoom} />
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}

function FeatureAnalysis() {
  const chips = ['Player tracking', 'Ball tracking', 'Court mapping', 'Heatmaps', 'CSV export'];
  return (
    <section id="features" className="mx-auto grid max-w-7xl items-center gap-16 px-6 py-24 lg:grid-cols-2">
      <FadeInUp>
        <Badge>SmartPlay analysis</Badge>
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">From match video to match intelligence.</h2>
        <p className="mt-6 max-w-lg text-gray-400">
          SmartPlay is our AI engine for padel. Give it a match video and computer vision detects the players, the ball and the
          court, then turns every rally into statistics, positions and heatmaps that players, coaches and clubs can act on.
        </p>
        <div className="mt-8">
          <PrimaryButton>Request a demo</PrimaryButton>
        </div>
      </FadeInUp>

      <FadeInUp delay={150}>
        <VideoMockup focus="88% 35%" zoom={1.5}>
          <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/90 p-4 backdrop-blur-xl">
            <div className="mb-4 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-gray-300">
                  {c}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
              </svg>
              <span className="flex-1 text-sm text-gray-500">Upload a padel match…</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </div>
        </VideoMockup>
      </FadeInUp>
    </section>
  );
}

function FeatureTracking() {
  const bars = [6, 14, 9, 22, 12, 30, 18, 26, 10, 34, 20, 15, 28, 8, 24, 16, 32, 11, 19, 27, 13, 21, 7, 17];
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-16 px-6 py-24 lg:grid-cols-2">
      <FadeInUp className="order-2 lg:order-1">
        <VideoMockup focus="58% 75%" zoom={1.6}>
          <div className="rounded-2xl border border-white/10 bg-[#1C1C1E]/90 p-5 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black">
                <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor">
                  <path d="M7 4l13 8-13 8z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium text-white">Player 3 – Rally 12</p>
                <p className="text-xs text-gray-500">Example output</p>
              </div>
            </div>
            <p className="mt-5 text-xs text-gray-500">Speed over the rally</p>
            <div className="mt-2 flex h-10 items-end gap-1">
              {bars.map((h, i) => (
                <span key={i} className={`w-full rounded-full ${i < 10 ? 'bg-brand-blue' : 'bg-white/15'}`} style={{ height: `${h + 6}px` }} />
              ))}
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-2">
              {[
                ['Distance', '412 m'],
                ['Top speed', '17.8 km/h'],
                ['Net presence', '38 %'],
                ['Calories', '58 kcal'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2.5">
                  <dt className="text-[11px] text-gray-500">{k}</dt>
                  <dd className="text-sm font-medium text-white">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </VideoMockup>
      </FadeInUp>

      <FadeInUp delay={150} className="order-1 lg:order-2">
        <Badge>Player &amp; ball tracking</Badge>
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">See every movement, every shot.</h2>
        <p className="mt-6 max-w-lg text-gray-400">
          Our computer-vision pipeline follows the four players and the ball frame by frame, maps them onto the court and builds
          the data behind each rally. Built first for padel, designed to extend to other sports.
        </p>
        <div className="mt-8">
          <PrimaryButton>Request a demo</PrimaryButton>
        </div>
      </FadeInUp>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 6. Capabilities — statuts honnêtes (voir CLAUDE.md)               */
/* ---------------------------------------------------------------- */

// Ne passer un élément en 'Available' que s'il marche réellement pour un client.
type Status = 'Prototype' | 'Available' | 'Coming soon';

const features: { title: string; text: string; status: Status }[] = [
  {
    title: 'Player tracking',
    text: 'All four players followed frame by frame with stable IDs, even when they cross or hide behind each other.',
    status: 'Prototype',
  },
  {
    title: 'Ball tracking & bounces',
    text: 'A model built for small, fast balls follows every rally, ignores reflections on the glass and marks each bounce on the court.',
    status: 'Prototype',
  },
  {
    title: 'Court mapping',
    text: 'Positions converted from pixels to metres on a real padel court, so distances and speeds are physical values.',
    status: 'Prototype',
  },
  {
    title: 'Movement stats',
    text: 'Distance covered, top and average speed, and estimated calories for each player.',
    status: 'Prototype',
  },
  {
    title: 'Heatmaps',
    text: 'Where each player spends the match, shown on a 3D court you can rotate.',
    status: 'Prototype',
  },
  {
    title: 'Tactical indicators',
    text: 'Net presence (time within 3 m of the net) and speed consistency, to compare positioning and intensity.',
    status: 'Prototype',
  },
  {
    title: 'Data export',
    text: 'The annotated match video (MP4) and the frame-by-frame data (CSV) for your own tools.',
    status: 'Prototype',
  },
  {
    title: 'Shot recognition',
    text: 'Smash, bandeja, víbora, volley, lob, forehand and backhand, counted for each player.',
    status: 'Coming soon',
  },
  {
    title: 'Automatic scoring',
    text: 'The match score kept automatically from bounces and hits.',
    status: 'Coming soon',
  },
];

const STATUS_STYLE: Record<Status, string> = {
  Available: 'border-white bg-white text-black',
  Prototype: 'border-brand-blue/70 bg-brand-blue/25 text-white',
  'Coming soon': 'border-white/10 bg-transparent text-gray-500',
};

function Capabilities() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <FadeInUp className="mx-auto max-w-2xl text-center">
        <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">What SmartPlay measures</h2>
        <p className="mt-6 text-gray-400">
          SmartPlay is a working prototype. Here is what it does today and what we are building next.
        </p>
      </FadeInUp>
      <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f, i) => (
          <FadeInUp key={f.title} delay={(i % 3) * 80} className="h-full">
            <div className="flex h-full flex-col bg-black p-6">
              <div className="flex items-start justify-between gap-4">
                <h3 className={`text-base font-medium ${f.status === 'Coming soon' ? 'text-gray-400' : 'text-white'}`}>{f.title}</h3>
                <span className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[f.status]}`}>
                  {f.status}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-400">{f.text}</p>
            </div>
          </FadeInUp>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 7. FAQ                                                            */
/* ---------------------------------------------------------------- */

const FAQS = [
  {
    q: 'What is HeroScore?',
    a: 'HeroScore is a SportTech and AI company. We build computer-vision technology that analyzes sports from video. Our first product, SmartPlay, is dedicated to padel.',
  },
  {
    q: 'Why padel, and why Tunisia?',
    a: 'We explored AI across football, basketball and padel. Padel is growing fast in Tunisia, and that is where we are focusing our technology and resources first.',
  },
  {
    q: 'What does SmartPlay give me after a match?',
    a: 'An annotated video of the match, a dashboard with a card per player (distance, speed, calories, net presence), heatmaps on a 3D court, and a CSV file with the frame-by-frame data. Shot recognition and automatic scoring are in development.',
  },
  {
    q: 'What camera setup do I need?',
    a: 'One fixed camera placed high behind the court, filming the whole court. A moving or zooming camera makes court mapping much harder, so for now we work with fixed setups.',
  },
  {
    q: 'Is SmartPlay available today?',
    a: 'SmartPlay is currently a working prototype. We are looking for padel clubs, coaches and players in Tunisia to run pilots with us.',
  },
  {
    q: 'Is my match video safe?',
    a: 'Your videos are used only to produce your analysis. Contact us for details on how we store and process match footage during a pilot.',
  },
];

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="mx-auto max-w-3xl px-6 py-32">
      <FadeInUp>
        <h2 className="mb-12 text-center text-4xl font-semibold tracking-tight md:text-5xl">We’ve got answers</h2>
      </FadeInUp>
      <FadeInUp delay={100}>
        <div className="rounded-xl border border-white/10 bg-transparent">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={i < FAQS.length - 1 ? 'border-b border-white/10' : ''}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-6 px-6 py-6 text-left"
                  aria-expanded={isOpen}
                >
                  <span className="text-base font-medium text-white">{f.q}</span>
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-45' : 'rotate-0'}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                <div
                  className="grid transition-[grid-template-rows] duration-300 ease-out"
                  style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
                >
                  <div className="overflow-hidden">
                    <p className="px-6 pb-6 text-sm text-gray-400">{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </FadeInUp>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* 8. Footer                                                         */
/* ---------------------------------------------------------------- */

const CONTACT_EMAIL = 'kamelaymen793@gmail.com';

// Liens réseaux sociaux / pages légales : les ajouter ici dès que les vraies URL existent (pas de liens « # » morts).
const COLS = [
  { title: 'Company', links: [['About', '#about'], ['Team', '#about'], ['FAQ', '#faq']] },
  { title: 'Product', links: [['How it works', '#how'], ['Features', '#features'], ['3D replay', '#replay']] },
  { title: 'Contact', links: [['Email us', `mailto:${CONTACT_EMAIL}`], ['Request a demo', `mailto:${CONTACT_EMAIL}?subject=SmartPlay%20demo`]] },
];

function Footer() {
  return (
    <footer id="contact" className="relative z-0 overflow-hidden border-t border-white/5 px-6 pb-10 pt-32">
      <ParallaxMedia className="-z-10 opacity-40" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black via-black/60 to-black" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_bottom,rgba(30,58,138,0.35)_0%,transparent_60%)]" />

      <FadeInUp className="mb-32 flex flex-col items-center text-center">
        <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">
          Ready to make your game <span className="font-serif font-normal italic">intelligent?</span>
        </h2>
        <p className="mt-6 max-w-xl text-[16px] text-gray-400">Club, coach or player in Tunisia? Run SmartPlay on one of your matches.</p>
        <div className="mt-10 flex flex-row flex-wrap justify-center gap-3">
          <PrimaryButton href={`mailto:${CONTACT_EMAIL}?subject=SmartPlay%20demo`}>Request a demo</PrimaryButton>
          <SecondaryButton href="#about">About us</SecondaryButton>
        </div>
      </FadeInUp>

      <div className="mx-auto mb-24 grid max-w-7xl grid-cols-1 gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center">
            <Logo className="h-20 w-auto" />
          </div>
          <p className="mt-4 text-sm text-gray-400">Making sports intelligent. Starting with padel.</p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="mb-4 text-sm font-medium text-white">{c.title}</p>
            <ul className="space-y-3">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  <a href={href} className="text-sm text-gray-400 transition-colors hover:text-white">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 border-t border-white/5 pt-8 text-xs text-gray-500 md:flex-row">
        <span>© 2026 HeroScore. All rights reserved</span>
        <span className="hidden md:inline">•</span>
        <span>
          SportTech × <span className="text-gray-300">Artificial Intelligence</span>
        </span>
        <span className="hidden md:inline">•</span>
        <span>
          Made in <span className="text-gray-300">Tunisia</span>
        </span>
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------- */

export default function Page() {
  return (
    <main className="min-h-screen bg-black font-sans text-white antialiased">
      <ScrollProgress />
      <Nav />
      <Hero />
      <About />
      <HowItWorks />
      <FeatureAnalysis />
      <FeatureTracking />
      <CourtReplay />
      <Capabilities />
      <FAQ />
      <Footer />
    </main>
  );
}
