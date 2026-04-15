import { render } from 'solid-js/web';

export default function HcStub() {
  return <div>hc</div>;
}

render(() => <HcStub />, document.getElementById('app')!);
