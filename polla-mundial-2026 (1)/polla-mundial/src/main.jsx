import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

window.storage = {
  async get(key) {
    try {
      const val = localStorage.getItem('polla_' + key)
      if (!val) return null
      return { key, value: val }
    } catch { return null }
  },
  async set(key, value) {
    try {
      localStorage.setItem('polla_' + key, value)
      return { key, value }
    } catch { return null }
  },
  async delete(key) {
    try {
      localStorage.removeItem('polla_' + key)
      return { key, deleted: true }
    } catch {}
  },
  async list(prefix) {
    try {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('polla_' + prefix)) {
          keys.push(k.replace('polla_', ''))
        }
      }
      return { keys }
    } catch { return { keys: [] } }
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
