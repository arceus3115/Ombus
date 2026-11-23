import './styles/index.css';
import { byId } from './components/dom.ts';
import { mountIntake } from './features/intake/surface.ts';
import { mountCases } from './features/cases/surface.ts';

if (location.pathname === '/cases') {
  byId('nav-cases').setAttribute('aria-current', 'page');
  void mountCases();
} else {
  byId('nav-intake').setAttribute('aria-current', 'page');
  byId('intake-surface').hidden = false;
  mountIntake();
}
