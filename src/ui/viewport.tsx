// Minimal Qwik viewport component
export class ViewportComponent {
  private container?: HTMLElement;

  mount(element: HTMLElement): void {
    this.container = element;
    element.setAttribute('data-viewport', 'theos-engine');
  }

  unmount(): void {
    if (this.container) {
      this.container.removeAttribute('data-viewport');
    }
  }
}
