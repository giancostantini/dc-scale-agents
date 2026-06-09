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

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getClient,
  deleteClient,
  updateClientLogo,
  updateClientCore,
  listClientContacts,
  addClientContact,
  updateClientContact,
  deleteClientContact,
  type ClientContactInput,
} from "@/lib/storage";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { uploadFile } from "@/lib/upload";
import type { Client, ClientContact, OnboardingFile } from "@/lib/types";
import InviteUserModal from "@/components/InviteUserModal";
import EditClientCoreModal from "@/components/EditClientCoreModal";
import LibraryUploadButton from "@/components/LibraryUploadButton";
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
  const [savingLogo, setSavingLogo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Invitar al portal
  const [inviteOpen, setInviteOpen] = useState(false);

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

  // Edit creation
  const [editCoreOpen, setEditCoreOpen] = useState(false);

  async function refresh() {
    const [c, prof, ct] = await Promise.all([
      getClient(id),
      getCurrentProfile(),
      listClientContacts(id),
    ]);
    setClient(c ?? null);
    setIsDirector(prof?.role === "director");
    setContacts(ct);
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
  async function handleLogoFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validación rápida de tipo
    if (!file.type.startsWith("image/")) {
      alert("El archivo tiene que ser una imagen (PNG, JPG, SVG, etc).");
      e.target.value = "";
      return;
    }
    // Validación de tamaño (~5MB max)
    if (file.size > 5 * 1024 * 1024) {
      alert("La imagen pesa más de 5MB. Bajá el peso e intentá de nuevo.");
      e.target.value = "";
      return;
    }
    setUploadingLogo(true);
    try {
      // Path: logos/{clientId}/{timestamp}_{filename}
      const uploaded = await uploadFile(file, `logos/${id}`);
      await updateClientLogo(id, uploaded.url ?? null);
      await refresh();
    } catch (err) {
      const e = err as Error;
      alert(`No se pudo subir el logo: ${e.message}`);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function clearLogo() {
    if (!confirm("¿Quitar el logo? Se va a mostrar el fallback de iniciales.")) return;
    setSavingLogo(true);
    try {
      await updateClientLogo(id, null);
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

      {/* ============== ESTADO / FASE ============== */}
      {/* Si el cliente está en onboarding y el director ya lo dio
          por activado, lo promovemos a 'active' con un click. Útil
          para clientes históricos que se crearon como onboarding
          y nunca se promovieron. */}
      {client.status === "onboarding" && (
        <div
          className={ui.panel}
          style={{
            marginBottom: 24,
            borderLeft: "3px solid var(--green-ok)",
          }}
        >
          <div className={ui.panelHead}>
            <div>
              <div className={ui.panelTitle}>Estado del cliente</div>
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                Hoy aparece como <strong>Onboarding</strong>. Si ya
                terminó la fase de estrategia/branding y entró en
                ejecución, marcalo como activo para que aparezca como{" "}
                <strong>"● Growth"</strong> en el hub.
              </div>
            </div>
            <button
              onClick={async () => {
                if (
                  !confirm(
                    "¿Marcar este cliente como activo (en ejecución)?",
                  )
                ) {
                  return;
                }
                try {
                  const updated = await updateClientCore(client.id, {
                    status: "active",
                    phase: "Activo · Ejecución",
                  });
                  setClient(updated);
                } catch (err) {
                  const e = err as Error;
                  alert(`No se pudo actualizar:\n${e.message}`);
                }
              }}
              style={{
                padding: "10px 18px",
                background: "var(--green-ok)",
                color: "var(--off-white)",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
                cursor: "pointer",
                fontFamily: "inherit",
                textTransform: "uppercase",
              }}
            >
              ✓ Activar cliente
            </button>
          </div>
        </div>
      )}

      {/* ============== EDITAR CREACIÓN ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div>
            <div className={ui.panelTitle}>Editar creación del cliente</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Corregir nombre, sector, contactos, fees, cuenta default,
              dividendos y otros datos cargados al crear el cliente.
            </div>
          </div>
          <button
            onClick={() => setEditCoreOpen(true)}
            style={{
              padding: "9px 18px",
              background: "var(--deep-green)",
              color: "var(--off-white)",
              border: "none",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ✎ Editar datos del cliente
          </button>
        </div>
      </div>

      {editCoreOpen && (
        <EditClientCoreModal
          client={client}
          open={editCoreOpen}
          onClose={() => setEditCoreOpen(false)}
          onSaved={(updated) => setClient(updated)}
        />
      )}

      {/* ============== CONTRATO ============== */}
      {/* Se movió desde Biblioteca: el contrato es información
          contractual, no documentación viva del cliente. Vive más
          natural junto con el resto de los datos de Configuración. */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div>
            <div className={ui.panelTitle}>Contrato</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              PDF firmado del contrato con el cliente.
            </div>
          </div>
        </div>
        <ContractPanel client={client} onChange={refresh} />
      </div>

      {/* ============== LOGO ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Logo del cliente</div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
          Subí el logo del cliente (PNG, JPG o SVG, hasta 5MB). Se guarda en
          el storage del sistema. Si no cargás ninguno, se muestran las
          iniciales como fallback.
        </p>
        <div
          style={{
            display: "flex",
            gap: 18,
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              width: 110,
              height: 110,
              background: "var(--ivory)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--deep-green)",
              fontSize: 32,
              fontWeight: 800,
              overflow: "hidden",
              border: "1px solid rgba(10,26,12,0.08)",
              flexShrink: 0,
            }}
          >
            {client.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.logo_url}
                alt={`Logo ${client.name}`}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  background: "white",
                }}
              />
            ) : (
              client.initials
            )}
          </div>
          <div style={{ flex: 1 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
              onChange={handleLogoFileChange}
              style={{ display: "none" }}
            />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo || savingLogo}
                style={{
                  padding: "10px 18px",
                  background: "var(--deep-green)",
                  color: "var(--off-white)",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: uploadingLogo ? "wait" : "pointer",
                  fontFamily: "inherit",
                  opacity: uploadingLogo ? 0.5 : 1,
                }}
              >
                {uploadingLogo
                  ? "Subiendo…"
                  : client.logo_url
                    ? "Reemplazar logo"
                    : "Subir logo"}
              </button>
              {client.logo_url && (
                <button
                  onClick={clearLogo}
                  disabled={savingLogo || uploadingLogo}
                  style={{
                    padding: "10px 14px",
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
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 8,
                lineHeight: 1.5,
              }}
            >
              Recomendado: PNG transparente cuadrado 512x512 o SVG.
              {client.logo_url && (
                <>
                  <br />
                  <strong>Logo actual:</strong>{" "}
                  <a
                    href={client.logo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--deep-green)" }}
                  >
                    abrir archivo
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ============== ACCESO DEL CLIENTE AL PORTAL ============== */}
      <div className={ui.panel} style={{ marginBottom: 24 }}>
        <div className={ui.panelHead}>
          <div className={ui.panelTitle}>Acceso al portal del cliente</div>
        </div>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
          Invitá al cliente al portal de solo lectura. Va a poder ver
          reportes, calendario de contenido, KPIs y mandar solicitudes.
        </p>
        <button
          onClick={() => setInviteOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 18px",
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
          ✉ Invitar al portal
        </button>
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

      {/* Modal: invitar al portal */}
      <InviteUserModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        initialUserType="client"
        initialClientId={id}
      />
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

// ============================================================
// ContractPanel — visualizar + subir/reemplazar el contrato PDF
// del cliente. El archivo se guarda en client.onboarding.contractFile
// (string path o OnboardingFile). Se gestiona acá en Configuración
// porque es información contractual, no documentación viva del
// cliente.
// ============================================================
function ContractPanel({
  client,
  onChange,
}: {
  client: Client;
  onChange: () => void;
}) {
  const contractFile = client.onboarding?.contractFile;
  const fileName = !contractFile
    ? null
    : typeof contractFile === "string"
      ? contractFile.split("/").pop() || contractFile
      : (contractFile as OnboardingFile).name;

  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          width: 64,
          height: 80,
          background: "var(--ivory)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 24,
          color: "var(--sand-dark)",
          border: "1px solid rgba(10,26,12,0.08)",
          flexShrink: 0,
        }}
      >
        📄
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        {fileName ? (
          <>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--deep-green)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={fileName}
            >
              {fileName}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              Reemplazá el archivo si necesitás actualizar el contrato.
            </div>
          </>
        ) : (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            Sin contrato cargado. Subí el PDF firmado para tenerlo
            disponible cuando lo necesites.
          </div>
        )}
      </div>
      <LibraryUploadButton
        client={client}
        target="contract"
        label={contractFile ? "↻ Reemplazar contrato" : "+ Subir contrato"}
        accept=".pdf"
        onUploaded={onChange}
      />
    </div>
  );
}
