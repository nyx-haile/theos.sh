import { render } from 'solid-js/web';
import { ScribePlayground } from './scribe-playground/scribe-playground';
import './scribe-playground/scribe-playground.css';

const root = document.getElementById('scribe-root');
if (!root) throw new Error('Scribe playground mount point is missing.');
render(() => <ScribePlayground />, root);
