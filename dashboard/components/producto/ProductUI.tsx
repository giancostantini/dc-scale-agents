"use client";

/** Bloques reutilizables para las páginas del backend comercial de producto. */

export function PageHead({
  eyebrow,
  title,
  accent,
}: {
  eyebrow: string;
  title: string;
  accent: string;
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: accent,
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        {eyebrow}
      </div>
      <h1
        style={{
          fontSize: 26,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: "var(--deep-green)",
          margin: 0,
        }}
      >
        {title}
      </h1>
    </div>
  );
}

export function KpiRow({ labels }: { labels: string[] }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 14,
        marginBottom: 24,
      }}
    >
      {labels.map((label) => (
        <div
          key={label}
          style={{
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            borderRadius: "var(--r-md)",
            padding: 18,
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--sand-dark)",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            {label}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--deep-green)" }}>
            —
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionGrid({
  sections,
}: {
  sections: { title: string; hint: string }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 16,
      }}
    >
      {sections.map((s) => (
        <section
          key={s.title}
          style={{
            background: "var(--white)",
            border: "1px solid rgba(10,26,12,0.08)",
            borderRadius: "var(--r-lg)",
            padding: 20,
            boxShadow: "var(--shadow-sm)",
            minHeight: 150,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--deep-green)" }}>
            {s.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            {s.hint}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
              fontSize: 12,
              fontStyle: "italic",
              opacity: 0.7,
              marginTop: 12,
              border: "1px dashed rgba(10,26,12,0.12)",
              borderRadius: "var(--r-md)",
              padding: 16,
              textAlign: "center",
            }}
          >
            Próximamente — conectar datos
          </div>
        </section>
      ))}
    </div>
  );
}
