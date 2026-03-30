import { useTranslation } from 'react-i18next'

export default function LanguageSwitcher({ className = '' }) {
  const { i18n } = useTranslation()
  const current = i18n.language

  function switchTo(lang) {
    if (lang === current) return
    i18n.changeLanguage(lang)
    localStorage.setItem('timelyops_language', lang)
  }

  return (
    <div className={`flex items-center gap-1 text-xs font-medium select-none ${className}`}>
      <button
        onClick={() => switchTo('en')}
        className={`px-1 py-0.5 rounded transition-colors ${
          current === 'en'
            ? 'text-emerald-700 font-semibold'
            : 'text-stone-400 hover:text-stone-600'
        }`}
      >
        EN
      </button>
      <span className="text-stone-300 leading-none">|</span>
      <button
        onClick={() => switchTo('es')}
        className={`px-1 py-0.5 rounded transition-colors ${
          current === 'es'
            ? 'text-emerald-700 font-semibold'
            : 'text-stone-400 hover:text-stone-600'
        }`}
      >
        ES
      </button>
    </div>
  )
}
