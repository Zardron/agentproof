export default {
  fail_on: 'high',
  require: {
    typecheck: true,
    tests: false,
    build: false,
    lint: false,
  },
  dependencies: {
    new_dependency: 'warn',
    advisories: true,
  },
  security: {
    secret_detection: true,
    auth_regression: true,
  },
}
