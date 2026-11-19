'use client';

import dynamic from 'next/dynamic';
import { motion, useScroll, useTransform } from 'framer-motion';

const Court3D = dynamic(() => import('./Court3D'), { ssr: false });

export default function Hero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 600], [0, 160]);
  const opacity = useTransform(scrollY, [0, 500], [1, 0]);

  return (
    <section className="hero" id="top">
      <motion.div className="hero-canvas" style={{ y }}>
        <Court3D />
      </motion.div>
      <div className="hero-fade" />
      <motion.div className="container hero-content" style={{ opacity }}>
        <motion.p className="eyebrow" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          HEROSCORE · SPORTTECH × IA
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.1 }}>
          Making sports
          <br />
          <span className="grad">intelligent.</span>
        </motion.h1>
        <motion.p className="lead" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25 }}>
          We have explored AI across football, basketball and padel. Now, we’re focusing our technology and resources on the
          growing Tunisian padel market, to transform how the game is analyzed, understood and experienced.
        </motion.p>
        <motion.div className="cta-row" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}>
          <a className="btn btn-primary" href="#contact">Demander une démo</a>
          <a className="btn btn-ghost" href="#smartplay">Découvrir SmartPlay</a>
        </motion.div>
      </motion.div>
      <div className="scroll-hint">Scroll</div>
    </section>
  );
}
