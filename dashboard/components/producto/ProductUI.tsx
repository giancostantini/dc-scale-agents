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

// --- estilos de formulario/botón compartidos ---
export const fieldStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--white)",
  color: "var(--deep-green)",
  outline: "none",
  width: "100%",
};
export const ghostBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: 12,
  fontWeight: 600,
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.15)",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
  color: "var(--deep-green)",
};
export function solidBtnStyle(bg: string): React.CSSProperties {
  return {
    padding: "8px 16px",
    fontSize: 12,
    fontWeight: 700,
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

export function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,26,12,0.5)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      {children}
    </div>
  );
}

export function ModalBox({
  width = 520,
  children,
}: {
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--white)",
        borderRadius: 14,
        padding: 24,
        width: "100%",
        maxWidth: width,
        maxHeight: "85vh",
        overflowY: "auto",
        boxShadow: "0 24px 64px rgba(10,26,12,0.3)",
      }}
    >
      {children}
    </div>
  );
}

/** Pill de estado con color. */
export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color,
        background: `${color}1A`,
      }}
    >
      {label}
    </span>
  );
}

/** KPIs con valor real (a diferencia de KpiRow, que muestra "—"). */
export function KpiCards({
  items,
}: {
  items: { label: string; value: string; accent?: string }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        gap: 14,
        marginBottom: 24,
      }}
    >
      {items.map((it) => (
        <div
          key={it.label}
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
            {it.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: it.accent ?? "var(--deep-green)" }}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Panel contenedor con título, hint opcional y acción a la derecha. */
export function Panel({
  title,
  hint,
  right,
  children,
}: {
  title: string;
  hint?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "var(--white)",
        border: "1px solid rgba(10,26,12,0.08)",
        borderRadius: "var(--r-lg)",
        padding: 20,
        boxShadow: "var(--shadow-sm)",
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--deep-green)" }}>{title}</div>
          {hint && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{hint}</div>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/** Estado vacío para listas. */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 28,
        textAlign: "center",
        color: "var(--text-muted)",
        fontSize: 13,
        border: "1px dashed rgba(10,26,12,0.12)",
        borderRadius: "var(--r-md)",
      }}
    >
      {children}
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
