// Candado del build: SOLO las reglas de hooks de React.
//
// Next 16 sacó el lint de `next build` ("next build no longer runs
// linting"), así que un hook mal ubicado compila verde y tira la página en
// producción. Pasó en el CRM (PR #136): un useCallback después del
// `if (!authChecked) return null` dejaba /pipeline en "This page couldn't
// load" en el 100% de las visitas.
//
// Config aparte, con una sola regla, a propósito: el lint completo
// (eslint.config.mjs) tiene avisos de estilo preexistentes que no rompen
// nada, y bloquear el build por ellos frenaría todo deploy. Esto bloquea
// únicamente lo que tira una página.
//
// Corre como parte de `npm run build` (script `lint:hooks`).

import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    // Ignora TODOS los comentarios `eslint-disable` en esta corrida:
    //   1) el código tiene disables de reglas de otros plugins
    //      (@next/next/no-img-element, @typescript-eslint/...) que acá no se
    //      cargan, y eslint los reporta como "Definition for rule not found";
    //   2) nadie puede apagar el candado con un comentario. Una violación de
    //      rules-of-hooks siempre arriesga tirar la página: se arregla, no se
    //      silencia. (Al crear esto, cero archivos la desactivaban.)
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
    },
  },
];
