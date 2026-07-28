export function WelcomeScreen() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-secondary)',
        gap: 16,
        userSelect: 'none',
      }}
    >
      <img src="/logo.png" alt="Iodine" style={{ width: 120, opacity: 0.9 }} />
      <p style={{ fontSize: 13, marginTop: 8 }}>Open a folder and select a file to start editing.</p>
    </div>
  );
}
