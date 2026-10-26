import { createRoot } from 'react-dom/client';
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/syncopate/400.css';
import '@fontsource/syncopate/700.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <App />,
);
