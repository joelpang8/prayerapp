// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Text and TextInput come from components/ui, which applies the app's font.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "react-native",
          importNames: ["Text", "TextInput"],
          message: "Use Text, TextInput or Span from components/ui so the app's font applies.",
        }],
      }],
    },
  },
]);
