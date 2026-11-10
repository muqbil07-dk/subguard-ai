import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import App from './App.jsx'
import { DemoProvider } from './context/DemoContext.jsx'
import { ErrorBoundary } from './components/ui.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><ErrorBoundary><BrowserRouter><MotionConfig reducedMotion="user"><DemoProvider><App /></DemoProvider></MotionConfig></BrowserRouter></ErrorBoundary></React.StrictMode>,
)
