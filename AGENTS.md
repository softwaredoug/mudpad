This is an electron app to help edit blog posts and other markdown content while providing live feedback from
LLMs and other services.

See docs folder for requirements, particularl prd.md


## Testing

Tests are in the tests/ folder

Tests are broken down into 3 categories:

- unit: tests for individual functions and components
- e2e: end-to-end tests for the entire app, simulating user interactions, but mocking external dependencies
- integration: tests that test the app with real external dependencies, such as the LLM API
