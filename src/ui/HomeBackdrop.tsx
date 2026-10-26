// Behind the Projects title: a real take rendered by Pianoverse (the sample, landscape, Follow camera), looping
// silently and full-bleed, toned down so the title reads over it. A still frame under reduced motion.
export default function HomeBackdrop() {
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className="home-backdrop" aria-hidden="true">
      <video src="home-reel.mp4" poster="home-reel.jpg" muted loop playsInline autoPlay={!still} preload="auto" />
      <span className="scrim" />
    </div>
  );
}
