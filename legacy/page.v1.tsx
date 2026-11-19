import Hero from '@/components/Hero';
import Reveal from '@/components/Reveal';

const steps = [
  { n: '01', title: 'Filmez le match', text: 'Une vidéo du match de padel, depuis une caméra fixe sur le terrain.' },
  { n: '02', title: 'SmartPlay analyse', text: 'La vision par ordinateur détecte et suit les joueurs, la balle et le terrain.' },
  { n: '03', title: 'Recevez vos stats', text: 'Statistiques, positions, déplacements et heatmaps du match, prêts à exploiter.' },
];

// Statut de chaque fonctionnalité : à mettre à jour selon ce qui marche réellement.
const features = [
  { title: 'Suivi des joueurs', text: 'Détection et tracking des 4 joueurs sur toute la durée du match.', status: 'Prototype' },
  { title: 'Suivi de la balle', text: 'Trajectoire de la balle image par image, même à grande vitesse.', status: 'Prototype' },
  { title: 'Heatmaps', text: 'Zones occupées par chaque joueur, pour lire le placement tactique.', status: 'Prototype' },
  { title: 'Statistiques de match', text: 'Déplacements, positions et indicateurs clés par joueur et par équipe.', status: 'Prototype' },
  { title: 'Analyse des coups', text: 'Détection et classification des frappes (smash, bandeja, volée…).', status: 'Bientôt' },
  { title: 'Score automatique', text: 'Comptage des points directement à partir de la vidéo.', status: 'Bientôt' },
];

const audiences = [
  { title: 'Joueurs', text: 'Comprenez votre jeu, suivez votre progression match après match.' },
  { title: 'Coachs & académies', text: 'Des données objectives au lieu de notes manuelles et de vidéos au téléphone.' },
  { title: 'Clubs', text: 'Un service premium qui fidélise vos joueurs et valorise vos terrains.' },
];

const sports = [
  { name: 'Padel', state: 'Focus actuel', on: true },
  { name: 'Football', state: 'Exploré', on: false },
  { name: 'Basketball', state: 'Exploré', on: false },
];

export default function Home() {
  return (
    <main>
      <nav className="nav">
        <div className="container nav-inner">
          <a href="#top" className="logo">
            HERO<span>SCORE</span>
          </a>
          <div className="nav-links">
            <a href="#smartplay">SmartPlay</a>
            <a href="#features">Fonctionnalités</a>
            <a href="#vision">Vision</a>
            <a href="#contact" className="btn btn-primary btn-sm">Démo</a>
          </div>
        </div>
      </nav>

      <Hero />

      <section className="section" id="smartplay">
        <div className="container">
          <Reveal>
            <p className="eyebrow">LE PRODUIT</p>
            <h2>
              SmartPlay. <span className="muted">Une vidéo de match, des statistiques en sortie.</span>
            </h2>
          </Reveal>
          <div className="steps">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.12} className="step">
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.2}>
            <div className="showcase">
              {/* Déposer l'image générée par ChatGPT dans public/images/hero.png */}
              <div className="showcase-img" role="img" aria-label="Analyse IA d'un match de padel" />
              <div className="showcase-tag">Visuel d’illustration</div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section section-alt" id="features">
        <div className="container">
          <Reveal>
            <p className="eyebrow">CE QUE SMARTPLAY EXTRAIT</p>
            <h2>Chaque match devient de la donnée.</h2>
          </Reveal>
          <div className="grid3">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.1} className="card">
                <span className={`badge ${f.status === 'Bientôt' ? 'badge-soon' : ''}`}>{f.status}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <Reveal>
            <p className="eyebrow">POUR QUI</p>
            <h2>Du joueur au club.</h2>
          </Reveal>
          <div className="grid3">
            {audiences.map((a, i) => (
              <Reveal key={a.title} delay={i * 0.1} className="card card-plain">
                <h3>{a.title}</h3>
                <p>{a.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt" id="vision">
        <div className="container">
          <Reveal>
            <p className="eyebrow">VISION</p>
            <h2>
              Une entreprise SportTech & IA. <span className="muted">On commence par le padel, en Tunisie.</span>
            </h2>
          </Reveal>
          <div className="sports">
            {sports.map((s, i) => (
              <Reveal key={s.name} delay={i * 0.12} className={`sport ${s.on ? 'sport-on' : ''}`}>
                <h3>{s.name}</h3>
                <span>{s.state}</span>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.3}>
            <div className="path">
              <span className="on">Tunisie</span>
              <i />
              <span>Afrique du Nord</span>
              <i />
              <span>Padel international</span>
              <i />
              <span>Autres sports</span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section" id="team">
        <div className="container">
          <Reveal>
            <p className="eyebrow">L’ÉQUIPE</p>
            <h2>Des ingénieurs qui construisent la technologie.</h2>
          </Reveal>
          <div className="grid2">
            <Reveal className="card card-plain">
              <h3>Aymen</h3>
              <p className="role">Co-fondateur</p>
              <p>Computer vision & IA. A conçu le pipeline SmartPlay (PFE, 2026).</p>
            </Reveal>
            <Reveal delay={0.1} className="card card-plain">
              <h3>Racem Dammak</h3>
              <p className="role">Co-fondateur</p>
              <p>[Rôle et parcours à compléter]</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section contact" id="contact">
        <div className="container">
          <Reveal>
            <h2 className="big">
              The future of sports
              <br />
              <span className="grad">is intelligent.</span>
            </h2>
            <p className="lead center">Club, coach ou joueur ? Testez SmartPlay sur l’un de vos matchs.</p>
            <div className="cta-row center">
              <a className="btn btn-primary" href="mailto:kamelaymen793@gmail.com?subject=Démo%20SmartPlay">
                Demander une démo
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <footer className="footer">
        <div className="container footer-inner">
          <span className="logo">
            HERO<span>SCORE</span>
          </span>
          <span>SportTech × Artificial Intelligence · Tunisie · © 2026</span>
        </div>
      </footer>
    </main>
  );
}
