// Tiny shared registry so only ONE Dropdown panel can be open at a time.
//
// Each Dropdown instance derives its `open` state from this registry: when
// dropdowns.openName matches the dropdown's `name` prop, it renders open;
// otherwise closed. Opening dropdown B from a state where A is open simply
// flips openName from 'A' to 'B' — A reactively closes, B opens.

class DropdownRegistry {
  openName = $state<string | null>(null);

  /** Open `name` if closed, close it if it was already the open one. */
  toggle(name: string): void {
    this.openName = this.openName === name ? null : name;
  }

  /** Force-close any open dropdown. Called from outside-click handlers. */
  close(): void {
    this.openName = null;
  }

  isOpen(name: string): boolean {
    return this.openName === name;
  }
}

export const dropdowns = new DropdownRegistry();
