import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

const savedTheme = localStorage.getItem('hisvex_theme') || 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)

// The stored language is restored inside i18n/index.ts at module init — it has
// to be in place before the first render, not applied from here afterwards.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
)
