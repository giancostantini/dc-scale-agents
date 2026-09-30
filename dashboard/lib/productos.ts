/**
 * Productos propios de D&C (Tilde, Encargue, Vuelta) — branding + config
 * compartida por el sidebar, el layout y las páginas de /producto/[slug].
 *
 * Los logos reales viven en /public/productos/<slug>.png (los favicons /
 * app-icons de cada app). El `accent` es el color de marca para los
 * acentos del dashboard.
 */

export interface ProductBrand {
  slug: string;
  name: string;
  tagline: string;
  accent: string;
  soft: string;
  mono: string;
  logo: string;
}

export const PRODUCTS: ProductBrand[] = [
  {
    slug: "tilde",
    name: "Tilde",
    tagline: "Carga y control de facturas de compra",
    accent: "#2F7D6B",
    soft: "rgba(47,125,107,0.10)",
    mono: "T",
    logo: "/productos/tilde.png",
  },
  {
    slug: "encargue",
    name: "Encargue",
    tagline: "Pedidos B2B por WhatsApp al ERP",
    accent: "#1F9D55",
    soft: "rgba(31,157,85,0.10)",
    mono: "E",
    logo: "/productos/encargue.png",
  },
  {
    slug: "vuelta",
    name: "Vuelta",
    tagline: "Ruteo y reparto de camiones",
    accent: "#E07A29",
    soft: "rgba(224,122,41,0.10)",
    mono: "V",
    logo: "/productos/vuelta.png",
  },
];

export const PRODUCT_BY_SLUG: Record<string, ProductBrand> = Object.fromEntries(
  PRODUCTS.map((p) => [p.slug, p]),
);
