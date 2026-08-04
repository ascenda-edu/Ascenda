import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    // Agent git worktrees are created INSIDE the repo, at .claude/worktrees/<id>/,
    // so each one carries a full second copy of __tests__. Without this, a plain
    // `npm test` in the main tree collects them too — and since a worktree exists
    // precisely so an agent can mutate code in isolation, those copies are often
    // deliberately broken. Observed: `npx jest __tests__/profile/` reporting 684
    // tests instead of 373, with `Cannot read properties of null (reading
    // 'useRef')` from the duplicate React module registries. The failures were
    // entirely an artefact of collecting somebody else's mutation experiment.
    '<rootDir>/.claude/worktrees/',
    // Fixture/helper modules that live under __tests__/ but contain no tests.
    '<rootDir>/__tests__/helpers/',
    '<rootDir>/__tests__/scoring_validation/phase1_profiles.ts',
    '<rootDir>/__tests__/scoring_validation/batch_runner.ts'
  ],
  transform: {
    // jsx override: tsconfig.json uses `jsx: "preserve"` (Next.js needs the
    // untransformed JSX), but ts-jest must emit real React.createElement calls
    // for .tsx component tests (e.g. the assistant widget renderer). The object
    // form merges over the discovered tsconfig.json, so paths/esModuleInterop
    // etc. are preserved; harmless for the existing .ts-only test suites.
    //
    // verbatimModuleSyntax override: tsconfig.json enables it so that erasing a
    // type-only import can never change runtime behaviour in the app. ts-jest
    // emits CommonJS, and the two are mutually exclusive — TS1286 rejects any
    // `import` statement in a module compiled to CJS. Disabling it HERE keeps
    // the guarantee where it matters (the shipped bundle, checked by
    // `tsc --noEmit`) without forcing the whole test suite to ESM.
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      { tsconfig: { jsx: 'react-jsx', verbatimModuleSyntax: false } }
    ]
  }
};

export default config;
