import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-onboarding"
  ],
  "framework": "@storybook/react-vite",
  previewHead: (head) => `
    ${head}
    <script>
      document.documentElement.setAttribute('data--Color', 'Light');
      document.documentElement.setAttribute('data-Palette', 'Default');
      document.documentElement.setAttribute('data-PalettePrimary', 'default');
      document.documentElement.setAttribute('data--Typography', 'Mode-1');
      document.documentElement.setAttribute('data--Size', 'Mode-1');
      document.documentElement.setAttribute('data--Radius', 'Mode-1');
    </script>
  `,
};
export default config;