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
    // Fixture/helper modules that live under __tests__/ but contain no tests.
    '<rootDir>/__tests__/scoring_validation/phase1_profiles.ts',
    '<rootDir>/__tests__/scoring_validation/batch_runner.ts'
  ],
  transform: {
    // jsx override: tsconfig.json uses `jsx: "preserve"` (Next.js needs the
    // untransformed JSX), but ts-jest must emit real React.createElement calls
    // for .tsx component tests (e.g. the assistant widget renderer). The object
    // form merges over the discovered tsconfig.json, so paths/esModuleInterop
    // etc. are preserved; harmless for the existing .ts-only test suites.
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react-jsx' } }]
  }
};

export default config;
