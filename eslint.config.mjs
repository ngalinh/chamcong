import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Giữ lint tương thích với codebase hiện tại khi chuyển từ `next lint`
    // sang ESLint CLI. Các quy tắc React Compiler mới sẽ được bật lại sau khi
    // những component cũ được refactor riêng, tránh chặn các bản vá nghiệp vụ.
    rules: {
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
