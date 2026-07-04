// eslint.config.js
import js from "@eslint/js";
import globals from "globals";


export default [
  {
    "ignores": ["node_modules/**", "dist/**", "build/**", "releases/**", "scripts/**"]
  },
  js.configs.recommended,
  {
    files: ["src/main/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node
      }
    },
  },
  {
    files: ["src/renderer/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser
      }
    },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_"
        }
      ]
    }
  }

];
