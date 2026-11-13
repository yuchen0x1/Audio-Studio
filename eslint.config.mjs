import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/.vitest-tmp/**',
      '**/coverage/**',
      'apps/web/public/**',
      'apps/desktop/src-tauri/**',
      '**/*.config.js',
      '**/*.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 构建脚本运行在 Node 环境
    files: ['**/scripts/**/*.{js,mjs}', 'apps/desktop/scripts/**'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler 风格规则：当前代码采用常见写法（effect 中初始化
      // 加载状态、按路由收起侧栏），逐一重构收益低，先保持关闭
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    // 测试与脚本允许更松散
    files: ['**/__tests__/**', '**/*.test.*', 'apps/web/scripts/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  prettier,
);
