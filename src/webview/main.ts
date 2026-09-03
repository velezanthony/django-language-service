import { mount } from 'svelte';
import App from './App.svelte';

// App.svelte renders the full diagram tree, then its onMount triggers the
// legacy boot module which wires drag / viewport / tooltip / persistence
// against the DOM that App rendered.
const target = document.getElementById('app');
if (target) {
  mount(App, { target });
}
