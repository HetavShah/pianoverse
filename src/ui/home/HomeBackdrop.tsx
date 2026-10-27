// Behind the Projects title: a real take rendered by Pianoverse (the sample in the Concert look: the whole keyboard and
// both hands), an 8-second seamless loop playing silently. It sits on the right at about its own size (1440×580) and
// fades into the ground, so it stays sharp on a wide screen instead of being stretched across it. A still frame under
// reduced motion.
export default function HomeBackdrop() {
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className="home-backdrop" aria-hidden="true">
      <video src="home-reel.mp4" poster="home-reel.jpg" muted loop playsInline autoPlay={!still} preload="auto" />
      <span className="scrim" />
    </div>
  );
}
