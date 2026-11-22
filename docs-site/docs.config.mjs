import { defineDocsConfig, NavIcon } from '@velezanthony/design/integration';

/* The documentation site: https://velezanthony.github.io/django-language-service/
 *
 * The extension's users read the Marketplace listing, which renders README.md and nothing else. This
 * site serves the other reader — someone looking at how the thing is built — so the engineering
 * documents are the site, and README.md is only its front door.
 *
 * Every page is an `external`: README.md, CHANGELOG.md, CONTRIBUTING.md and SECURITY.md have to stay
 * at the repository root (GitHub, pull requests and the Marketplace read them there), and the slugs
 * keep the URLs the MkDocs site published (`/CHANGELOG/`, `/docs/REFERENCE/`…). A new page under
 * docs/ needs an entry here; src/docs-workflow.test.ts fails until it has one. */
const REPO = 'https://github.com/velezanthony/django-language-service';

export default defineDocsConfig({
  site: {
    name: 'Django Language Service',
    social: { github: REPO },
    seo: {
      description:
        'Django Template Language support for VS Code that reads your project — the architecture, the reference and the contributor guide.',
      schema: [
        {
          '@type': 'SoftwareSourceCode',
          name: 'Django Language Service',
          description:
            'Django Template Language support for VS Code that reads your project: completions, hover, navigation, diagnostics and an ER diagram of your models.',
          codeRepository: REPO,
          programmingLanguage: ['TypeScript', 'Svelte'],
          runtimePlatform: 'Visual Studio Code',
          url: 'https://velezanthony.github.io/django-language-service/',
        },
      ],
    },
  },
  i18n: { locales: ['en'] },
  content: {
    external: [
      { slug: 'index', file: '../README.md' },
      { slug: 'docs/REFERENCE', file: '../docs/REFERENCE.md' },
      { slug: 'CHANGELOG', file: '../CHANGELOG.md' },
      { slug: 'SECURITY', file: '../SECURITY.md' },
      { slug: 'docs/ARCHITECTURE', file: '../docs/ARCHITECTURE.md' },
      { slug: 'CONTRIBUTING', file: '../CONTRIBUTING.md' },
      { slug: 'docs/OPEN-FINDINGS', file: '../docs/OPEN-FINDINGS.md' },
    ],
    nav: [
      { label: 'Home', slug: 'index' },
      { label: 'For users', sidebar: ['docs/REFERENCE', 'CHANGELOG'] },
      { label: 'Security', slug: 'SECURITY' },
      {
        label: 'For contributors',
        sidebar: ['docs/ARCHITECTURE', 'CONTRIBUTING', 'docs/OPEN-FINDINGS'],
      },
      { label: 'GitHub', href: REPO, icon: NavIcon.GITHUB },
    ],
    editUrl: `${REPO}/edit/main`,
    repoRoot: '..',
  },
});
