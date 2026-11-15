import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// Import boundaries from ARCHITECTURE.md section 6.
// no-restricted-imports sees the import text, not the resolved file, so an
// import that leaves a folder is caught by the name of the folder it reaches.
const otherSrcFolders =
  'store|features|components|lib|clock|link|data|styles|test|App|main|routes'
const outsideSrcFolders = 'ml|tools|public'

const relativeInto = (folders) => `^\\.{1,2}/(.*/)?(${folders})(\\.tsx?)?(/|$)`

// A bare package import other than the allowed ones (scoped packages start with "@").
const packageOtherThan = (allowed) => `^(?!(${allowed})(/|$))[^./]`

// Engine and body view code may import only zod; their tests may also import
// vitest. Both stay inside their own folder.
const pureBoundary = (folder, otherPure, allowedPackages) => [
  {
    regex: packageOtherThan(allowedPackages),
    message: `src/${folder} imports nothing outside src/${folder} except zod (ARCHITECTURE.md section 6).`,
  },
  {
    regex: relativeInto(`${otherPure}|${otherSrcFolders}|${outsideSrcFolders}`),
    message: `src/${folder} imports nothing outside src/${folder} except zod, and never src/${otherPure} (decision D11).`,
  },
]

const testFiles = ['**/__tests__/**']

const appBoundary = [
  {
    regex: '^three(/|$)',
    message:
      'three is imported only in src/features/body/viewer/ (ARCHITECTURE.md section 6).',
  },
  {
    regex: relativeInto('ml|tools'),
    message:
      'Nothing in src/ imports from ml/ or tools/; use the generated JSON in src/data/models/.',
  },
]

export default defineConfig([
  // .venv holds Python packages for ml/ (some ship JavaScript files); it is not our code.
  globalIgnores(['dist', 'coverage', '.venv']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    ignores: testFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: pureBoundary('engine', 'bodyview', 'zod') },
      ],
    },
  },
  {
    files: ['src/engine/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: pureBoundary('engine', 'bodyview', 'zod|vitest') },
      ],
    },
  },
  {
    files: ['src/bodyview/**/*.{ts,tsx}'],
    ignores: testFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: pureBoundary('bodyview', 'engine', 'zod') },
      ],
    },
  },
  {
    files: ['src/bodyview/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: pureBoundary('bodyview', 'engine', 'zod|vitest') },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/engine/**',
      'src/bodyview/**',
      'src/features/body/viewer/**',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: appBoundary }],
    },
  },
])
