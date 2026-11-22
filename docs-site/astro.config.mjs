// Publishes https://velezanthony.github.io/django-language-service/ as a GitHub Pages project site.
import { defineDocsSite } from '@velezanthony/design/integration';
import docsConfig from './docs.config.mjs';

export default defineDocsSite(docsConfig, {
  site: 'https://velezanthony.github.io',
  base: '/django-language-service',
});
