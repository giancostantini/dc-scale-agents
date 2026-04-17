"use client";

import Topbar from "./Topbar";

interface PlaceholderProps {
  eyebrow: string;
  title: string;
  description?: string;
}

export default function Placeholder({ eyebrow, title, description }: PlaceholderProps) {
  return (
    <>
      <Topbar showPrimary={false} />
      <main
        style={{
          padding: "80px 40px",
          maxWidth: "880px",
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "10px",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "var(--sand-dark)",
            fontWeight: 600,
            marginBottom: "14px",
          }}
        >
          {eyebrow}
        </div>
        <h1
          style={{
            fontSize: "56px",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            lineHeight: 1,
            marginBottom: "20px",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "15px",
            maxWidth: "520px",
            margin: "0 auto",
            lineHeight: 1.6,
          }}
        >
          {description ??
            "Esta vista todavía no está migrada. La completamos en el próximo paso — la lógica ya existe en el HTML original."}
        </p>
      </main>
    </>
  );
}
