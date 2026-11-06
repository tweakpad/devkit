import type { LitElement, ReactiveController } from 'lit';

/** Reveals a folder's guide while it or any nested content is hovered or focused. */
export class GroupGuide implements ReactiveController {
  constructor(private readonly host: LitElement) {
    host.addController(this);
  }

  hostConnected(): void {
    this.host.addEventListener('pointerover', this.#onPointerOver);
    this.host.addEventListener('pointerleave', this.#onPointerLeave);
    this.host.addEventListener('focusin', this.#onFocusIn);
    this.host.addEventListener('focusout', this.#onFocusOut);
  }

  hostDisconnected(): void {
    this.host.removeEventListener('pointerover', this.#onPointerOver);
    this.host.removeEventListener('pointerleave', this.#onPointerLeave);
    this.host.removeEventListener('focusin', this.#onFocusIn);
    this.host.removeEventListener('focusout', this.#onFocusOut);
    this.host.removeAttribute('data-guide-hover');
    this.host.removeAttribute('data-guide-focus');
  }

  #onPointerOver = (event: PointerEvent): void => {
    this.host.toggleAttribute('data-guide-hover', event.pointerType !== 'touch');
  };

  #onPointerLeave = (): void => {
    this.host.removeAttribute('data-guide-hover');
  };

  #onFocusIn = (): void => {
    this.host.setAttribute('data-guide-focus', '');
  };

  #onFocusOut = (): void => {
    this.host.removeAttribute('data-guide-focus');
  };
}
