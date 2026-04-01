import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <ToastContainer
        position="bottom-right"
        autoClose={3500}
        hideProgressBar={false}
        theme="dark"
        toastStyle={{ background: '#1F2937', border: '1px solid #374151' }}
      />
    </BrowserRouter>
  </React.StrictMode>
)
