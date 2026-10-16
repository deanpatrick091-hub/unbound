// Run inside the deployment environment; prints no credential values.
import { githubConfigurationChecks } from '../lib/github/security.ts';
for (const { name, state } of githubConfigurationChecks()) {
  console.log(`GITHUB_CONFIG_CHECK ${name} ${state}`);
}
