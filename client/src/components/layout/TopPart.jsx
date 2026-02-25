export default function TopPart({ title = 'Workout Session', subtitle = '' }) {
  return (
    <div>
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
  );
}
