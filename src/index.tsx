import { render } from 'solid-js/web';
import SurfaceApp from './surface-app';

const root = document.getElementById('app')!;
render(() => <SurfaceApp />, root);
