"use client";

/**
 * Configuración del cliente — director only.
 *
 * Tres secciones:
 *   1. Logo: setear URL del logo (Clearbit-friendly) + preview.
 *   2. Contactos: CRUD de client_contacts (N contactos por cliente).
 *   3. Zona crítica: eliminar el cliente con doble confirmación.
 *
 * Director only. Team/client → redirect al dashboard del cliente.
 */

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getClient,
  deleteClient,
  updateClientLogo,
  listClientContacts,
  addClientContact,
  updateClientContact,
  deleteClientContact,
  type ClientContactInput,
} from "@/lib/storage";
import { getCurrentProfile } from "@/lib/supabase/auth";
import type { Client, ClientContact } from "@/lib/types";
import ui from "@/components/ClientUI.module.css";

export default function ConfiguracionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null | undefined>(undefined);
  const [isDirector, setIsDirector] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<ClientContact[]>([]);

  // Logo
  const [logoDraft, setLogoDraft] = useState("");
  const [savingLogo, setSavingLogo] = useState(false);

  // Nuevo contacto
  const [showAddContact, setShowAddContact] = useState(false);
  const [contactForm, setContactForm] = useState<ClientContactInput>({
    name: "",
    role: "",
    email: "",
    phone: "",
    notes: "",
    is_primary: false,
  });
  const [savingContact, setSavingContact] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ClientContactInput>({
    name: "",
    role: "",
    email: "",
    phone: "",
    notes: "",
    is_primary: false,
  });

  // Delete client
  const [deletingClient, setDeletingClient] = useState(false);

  async function refresh() {
    const [c, prof, ct] = await Promise.all([
      getClient(id),
      getCurrentProfile(),
      listClientContacts(id),
    ]);
    setClient(c ?? null);
    setIsDirector(prof?.role === "director");
    setContacts(ct);
    if (c?.logo_url) setLogoDraft(c.logo_url);
  }

  useEffect(() => {
    refresh();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDirector === false) {
      router.replace(`/cliente/${id}`);
    }
  }, [isDirector, id, router]);

  if (client === undefined || isDirector === null) return null;
  if (client === null) return null;
  if (!isDirector) return null;

  // ============ Logo ============
  async function saveLogo() {
    setSavingLogo(true);
    try {
      await updateClientLogo(id, logoDraft.trim() || null);
      await refresh();
      alert("Logo actualizado.");
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo guardar: ${e.message}`);
    } finally {
      setSavingLogo(false);
    }
  }
  async function clearLogo() {
    if (!confirm("¿Quitar el logo? Se va a mostrar el fallback (Clearbit o iniciales).")) return;
    setSavingLogo(true);
    try {
      await updateClientLogo(id, null);
      setLogoDraft("");
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSavingLogo(false);
    }
  }

  // ============ Contactos ============
  async function saveNewContact() {
    if (!contactForm.name.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }
    setSavingContact(true);
    try {
      await addClientContact(id, contactForm);
      setContactForm({ name: "", role: "", email: "", phone: "", notes: "", is_primary: false });
      setShowAddContact(false);
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    } finally {
      setSavingContact(false);
    }
  }

  function openEdit(c: ClientContact) {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      role: c.role ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      notes: c.notes ?? "",
      is_primary: c.is_primary,
    });
  }

  async function saveEdit() {
    if (!editingId) return;
    if (!editForm.name.trim()) {
      alert("El nombre es obligatorio.");
      return;
    }
    try {
      await updateClientContact(editingId, editForm);
      setEditingId(null);
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    }
  }

  async function removeContact(c: ClientContact) {
    if (!confirm(`¿Eliminar el contacto ${c.name}?`)) return;
    try {
      await deleteClientContact(c.id);
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`Error: ${e.message}`);
    }
  }

  // ============ Eliminar cliente ============
  async function handleDeleteClient() {
    if (deletingClient) return;
    if (
      !confirm(
        `¿Eliminar el cliente "${client!.name}"?\n\n` +
          `Esto borra el cliente y TODO lo asociado: objetivos, notas, ` +
          `tareas, campañas, contenido, contactos, pagos y demás. ` +
          `NO se puede deshacer.`,
      )
    )
      return;
    const typed = window.prompt(
      `Para confirmar, tipeá el nombre exacto:\n\n${client!.name}`,
    );
    if (typed === null) return;
    if (typed.trim() !== client!.name) {
      alert("El nombre no coincide. Eliminación cancelada.");
      return;
    }
    setDeletingClient(true);
    try {
      await deleteClient(id);
      router.push("/hub");
    } catch (err) {
      const e = err as { code?: string; message?: string };
      alert(`No se pudo eliminar.\n${e.code ?? ""} ${e.message ?? ""}`);
      setDeletingClient(false);
    }
  }

  return (
    <>
      <div className={ui.head}>
        <div>
          <div className={ui.eyebrow}>Cliente · Configuración</div>
          <h1>Configuración de {client.name}</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6 }}>
            Logo, contactos de referencia y zona crítica.
          </p>
        </div>
      </div>

      {/* ============== LOGO ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Logo del cliente</div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          Pegá la URL de una imagen pública (PNG/JPG/SVG). Si no lo seteás, el
          sistema intenta resolverlo automáticamente desde Clearbit (basado
          en el dominio del email principal) y si no, cae a iniciales.
        </p>
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              width: 90,
              height: 90,
              background: "var(--ivory)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--deep-green)",
              fontSize: 26,
              fontWeight: 800,
              overflow: "hidden",
              border: "1px solid rgba(10,26,12,0.08)",
            }}
          >
            {logoDraft ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoDraft}
                alt="preview"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "white",
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.opacity = "0.3";
                }}
              />
            ) : (
              client.initials
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--sand-dark)",
                fontWeight: 600,
                marginBottom: 6,
              }}
            >
              URL del logo
            </label>
            <input
              value={logoDraft}
              onChange={(e) => setLogoDraft(e.target.value)}
              placeholder="https://logos.example.com/cliente.png"
              style={{
                width: "100%",
                padding: "10px 12px",
                fontSize: 13,
                border: "1px solid rgba(10,26,12,0.15)",
                borderRadius: 6,
                fontFamily: "inherit",
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {client.logo_url && (
            <button
              onClick={clearLogo}
              disabled={savingLogo}
              style={{
                padding: "8px 14px",
                background: "transparent",
                border: "1px solid rgba(176,75,58,0.2)",
                borderRadius: 6,
                color: "#B91C1C",
                fontSize: 12,
                cursor: savingLogo ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Quitar logo
            </button>
          )}
          <button
            onClick={saveLogo}
            disabled={savingLogo}
            style={{
              padding: "8px 14px",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              cursor: savingLogo ? "wait" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {savingLogo ? "Guardando…" : "Guardar logo"}
          </button>
        </div>
      </div>

      {/* ============== CONTACTOS ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div>
            <div className={ui.panelTitle}>Contactos de referencia</div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Tantos como necesites — CEO, marketing, brand, operativo, etc.
            </p>
          </div>
          {!showAddContact && (
            <button
              onClick={() => setShowAddContact(true)}
              style={{
                padding: "8px 14px",
                background: "var(--deep-green)",
                color: "var(--off-white)",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              + Agregar contacto
            </button>
          )}
        </div>

        {/* Form: nuevo contacto */}
        {showAddContact && (
          <div
            style={{
              padding: 16,
              background: "var(--ivory)",
              borderRadius: 8,
              marginBottom: 14,
              border: "1px solid rgba(196,168,130,0.25)",
            }}
          >
            <ContactForm
              form={contactForm}
              setForm={setContactForm}
              onSave={saveNewContact}
              onCancel={() => {
                setShowAddContact(false);
                setContactForm({ name: "", role: "", email: "", phone: "", notes: "", is_primary: false });
              }}
              saving={savingContact}
              saveLabel="Agregar"
            />
          </div>
        )}

        {/* Lista de contactos */}
        {contacts.length === 0 ? (
          <div
            style={{
              padding: 24,
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
              fontStyle: "italic",
            }}
          >
            Sin contactos cargados todavía.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {contacts.map((c) =>
              editingId === c.id ? (
                <div
                  key={c.id}
                  style={{
                    padding: 16,
                    background: "var(--ivory)",
                    borderRadius: 8,
                    border: "1px solid rgba(196,168,130,0.25)",
                  }}
                >
                  <ContactForm
                    form={editForm}
                    setForm={setEditForm}
                    onSave={saveEdit}
                    onCancel={() => setEditingId(null)}
                    saveLabel="Guardar cambios"
                  />
                </div>
              ) : (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 200px 80px",
                    gap: 14,
                    padding: 14,
                    background: "var(--white)",
                    border: "1px solid rgba(10,26,12,0.06)",
                    borderRadius: 8,
                    borderLeft: c.is_primary
                      ? "3px solid var(--sand)"
                      : "1px solid rgba(10,26,12,0.06)",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "var(--deep-green)",
                      }}
                    >
                      {c.name}
                      {c.is_primary && (
                        <span
                          style={{
                            marginLeft: 8,
                            padding: "2px 8px",
                            fontSize: 9,
                            background: "var(--sand)",
                            color: "var(--deep-green)",
                            borderRadius: 999,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            fontWeight: 700,
                          }}
                        >
                          Principal
                        </span>
                      )}
                    </div>
                    {c.role && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                        {c.role}
                      </div>
                    )}
                    {c.notes && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontStyle: "italic" }}>
                        {c.notes}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {c.email && <div>{c.email}</div>}
                    {c.phone && <div style={{ marginTop: 2 }}>{c.phone}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => openEdit(c)}
                      style={iconBtn}
                      title="Editar"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => removeContact(c)}
                      style={{ ...iconBtn, color: "#B91C1C" }}
                      title="Eliminar"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* ============== ZONA CRÍTICA ============== */}
      <div
        className={ui.panel}
        style={{ borderLeft: "3px solid #B91C1C", marginBottom: 40 }}
      >
        <div className={ui.panelHead}>
          <div className={ui.panelTitle} style={{ color: "#B91C1C" }}>
            Zona crítica
          </div>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 16 }}>
          Eliminar el cliente borra <strong>todo lo asociado</strong>: objetivos,
          notas, tareas, campañas, contenido, contactos, asignaciones de equipo,
          pagos y movimientos bancarios vinculados. <strong>No se puede deshacer.</strong>
        </p>
        <button
          onClick={handleDeleteClient}
          disabled={deletingClient}
          style={{
            padding: "10px 18px",
            background: "#B91C1C",
            color: "white",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: deletingClient ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {deletingClient ? "Eliminando…" : "Eliminar cliente"}
        </button>
      </div>
    </>
  );
}

const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  background: "transparent",
  border: "1px solid rgba(10,26,12,0.1)",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 14,
  color: "var(--deep-green)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

// ============================================================
// ContactForm (compartido entre Add y Edit)
// ============================================================
function ContactForm({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  saveLabel,
}: {
  form: ClientContactInput;
  setForm: (f: ClientContactInput) => void;
  onSave: () => void | Promise<void>;
  onCancel: () => void;
  saving?: boolean;
  saveLabel: string;
}) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <FormField label="Nombre" required>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={inputStyle}
            placeholder="Ej: María González"
          />
        </FormField>
        <FormField label="Rol / Cargo">
          <input
            value={form.role ?? ""}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            style={inputStyle}
            placeholder="CEO, Marketing Lead, Brand Mgr…"
          />
        </FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <FormField label="Email">
          <input
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={inputStyle}
            placeholder="contacto@empresa.com"
          />
        </FormField>
        <FormField label="Teléfono">
          <input
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            style={inputStyle}
            placeholder="+598..."
          />
        </FormField>
      </div>
      <FormField label="Notas (opcional)">
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
          placeholder="Contexto, cuándo escribir, preferencias…"
        />
      </FormField>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          margin: "10px 0",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={form.is_primary ?? false}
          onChange={(e) => setForm({ ...form, is_primary: e.target.checked })}
          style={{ width: "auto", margin: 0 }}
        />
        Marcar como contacto principal
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid rgba(10,26,12,0.15)",
            borderRadius: 6,
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: "8px 14px",
            background: "var(--deep-green)",
            color: "var(--off-white)",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: saving ? "wait" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Guardando…" : saveLabel}
        </button>
      </div>
    </>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 10,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--sand-dark)",
          fontWeight: 600,
          marginBottom: 5,
        }}
      >
        {label}
        {required && <span style={{ color: "#B91C1C", marginLeft: 4 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  fontSize: 12,
  border: "1px solid rgba(10,26,12,0.12)",
  borderRadius: 6,
  fontFamily: "inherit",
  background: "var(--white)",
  color: "var(--deep-green)",
  outline: "none",
};
