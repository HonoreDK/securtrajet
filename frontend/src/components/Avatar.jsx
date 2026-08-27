export default function Avatar({ src, letter, color = '#0f766e', size = 40, fontSize, style }) {
  const base = {
    width: size, height: size, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', fontWeight: 700, fontSize: fontSize || Math.round(size * 0.4),
    background: color, overflow: 'hidden', flexShrink: 0, ...style
  }

  if (src) {
    return (
      <div style={base}>
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    )
  }

  return <div style={base}>{letter}</div>
}
