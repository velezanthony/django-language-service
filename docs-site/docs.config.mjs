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
      {
        slug: 'index',
        file: '../README.md',
        seo: {
          title: 'Django Language Service: Django template support for VS Code',
          titleSuffix: false,
          description:
            'VS Code extension for Django templates that reads your models, views, forms and urls: real completions, hover, go-to-definition, diagnostics and an ER diagram.',
        },
      },
      {
        slug: 'docs/REFERENCE',
        file: '../docs/REFERENCE.md',
        seo: {
          title: 'Commands, settings and keybindings',
          description:
            'Every command, keybinding and setting of the Django Language Service VS Code extension, plus which Django files the indexer reads and what it needs.',
        },
      },
      {
        slug: 'CHANGELOG',
        file: '../CHANGELOG.md',
        seo: {
          title: 'Changelog and release notes',
          description:
            'Release notes for the Django Language Service VS Code extension: what each version adds, changes and fixes in Django template support and the ER diagram.',
        },
      },
      {
        slug: 'SECURITY',
        file: '../SECURITY.md',
        seo: {
          title: 'Security policy',
          description:
            'How to report a vulnerability in Django Language Service privately, which versions get fixes, and exactly what the extension reads from your workspace.',
        },
      },
      {
        slug: 'docs/ARCHITECTURE',
        file: '../docs/ARCHITECTURE.md',
        seo: {
          title: 'Architecture of the extension',
          description:
            'How the Django Language Service extension is built: hexagonal layers, the scan pipeline that indexes a Django project, the runtime flow and the webview UI.',
        },
      },
      {
        slug: 'CONTRIBUTING',
        file: '../CONTRIBUTING.md',
        seo: {
          title: 'Contributing: build and test',
          description:
            'Set up Django Language Service locally: prerequisites, build commands, unit and VS Code integration tests, the pre-commit hook and the commit conventions.',
        },
      },
      {
        slug: 'docs/OPEN-FINDINGS',
        file: '../docs/OPEN-FINDINGS.md',
        seo: {
          title: 'Open findings and limitations',
          description:
            'Known gaps and limitations of Django Language Service: what is not fixed yet, what was left out on purpose and behaviour changes worth knowing about.',
        },
      },
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
