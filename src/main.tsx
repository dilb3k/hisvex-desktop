import ReactDOM from 'react-dom/client'
import { App } from './App'
import { setLanguage } from './i18n'
import './styles/globals.css'

const savedTheme = localStorage.getItem('hisvex_theme') || 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)

const savedLanguage = localStorage.getItem('hisvex_language')
if (savedLanguage === 'uz' || savedLanguage === 'ru') {
  setLanguage(savedLanguage)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />,
)
