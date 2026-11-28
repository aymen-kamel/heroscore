# HeroScore — site web

Startup SportTech & IA (Aymen + Racem Dammak). Focus actuel : padel en Tunisie. Produit : **SmartPlay** (vidéo de match → statistiques).
Slogan : « Making sports intelligent. »

## Stack
- Next.js (App Router, export statique `out/`), TypeScript, Tailwind CSS v4
- Page entière dans `app/page.tsx` (un seul fichier React, sections : Nav, Hero (#top), About (#about : histoire, principes, équipe), How it works, Feature analyse, Feature tracking, 3D replay (`app/CourtReplay.tsx`), Capabilities, FAQ, Footer)
- 3D replay (marketing) : scène three.js portée de l'artifact « HeroScore Real Replay », mais rallye 100 % chorégraphié dans `app/rallySim.ts` (aucune donnée réelle, choix d'Aymen). Effets : bloom (desktop), balle lumineuse + traînée, rebonds/vitre (ondes), swing, nom du coup + vitesse, score, heatmap/traces/carte des rebonds. Bloc feature (pas dans le hero) ; au scroll la carte s'incline puis se pose et, en mode Cinematic, la caméra suit le scroll. Mention « animated demo » sous la carte ; « Shot type » et « Live score » marqués Coming soon
- Couleurs : noir / blanc / gris uniquement + une touche de bleu foncé (`--color-brand-blue` dans `globals.css`). Logo : `public/images/logo.png` (blanc, fond transparent)
- Contenu SmartPlay basé sur le PFE (`../../pfe_examination_smartplay.md`) : pipeline réel (homographie 10×20 m, tracking 4 joueurs, TrackNet 8 frames, export MP4 + CSV)
- Style : fond noir, texte blanc, titres Inter + mot clé en Instrument Serif italique, animation FadeInUp (IntersectionObserver), marquee infini
- Fond : `ParallaxMedia` dans page.tsx (zoom lent + parallax souris). Joue `public/videos/hero.mp4` s’il existe, sinon affiche `public/images/hero.jpg` (visuel ChatGPT)
- `legacy/` : première version (terrain padel 3D React Three Fiber + framer-motion), réutilisable si on veut remettre de la 3D

## Règles de contenu
- Ne jamais annoncer une fonctionnalité comme disponible si elle ne marche pas réellement. Statuts dans `app/page.tsx` (tableau `features`) : « Prototype », « Available », « Coming soon » (site en anglais). Reconnaissance des coups et score automatique = « Coming soon » tant qu'ils ne sont pas validés.
- Pas de chiffres (clients, précision du modèle, revenus) non vérifiés.

## Images
- Photos équipe : `public/images/team/` (`nom.jpg` ~900 px + `nom-thumb.jpg` 256 px carré). Clic sur une carte de l’équipe (section About) = fenêtre photo animée (`TeamModal`).
- Visuels générés avec ChatGPT : à mettre dans `public/images/`.

## À faire
- Ajouter les liens LinkedIn / GitHub des fondateurs dans `TEAM` (section About ; bios et e-mails déjà ajoutés).
- Remplacer le visuel par une vraie capture/vidéo de SmartPlay dès qu’elle existe.
- Formulaires (contact + pilote) : aujourd’hui ouvrent le mail du visiteur (mailto) ; brancher Formspree/Web3Forms si on veut un envoi direct.
- Pilote gratuit 1 mois (section #pilot) : inscription + rendez-vous avant de démarrer ; conditions détaillées à confirmer (durée, ce qui est inclus, nombre de places).
- Version anglaise.
