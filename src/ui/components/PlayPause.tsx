// Play that turns into pause (and back): two shapes that reshape into the two bars, the way media players do it.
export default function PlayPause({ playing, size = 16 }: { playing: boolean; size?: number }) {
  return (
    <svg className={'playpause' + (playing ? ' playing' : '')} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path className="pp-a" /><path className="pp-b" />
    </svg>
  );
}
