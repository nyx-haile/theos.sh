import { render } from 'solid-js/web';
import App from './app';
import SurfaceApp from './surface-app';
import { pickPipeline } from './pipeline-flag';

const pipeline = pickPipeline(
  location.href,
  typeof localStorage !== 'undefined' ? localStorage : undefined,
);

const root = document.getElementById('app')!;
if (pipeline === 'surface') {
  render(() => <SurfaceApp />, root);
} else {
  render(() => <App />, root);
}
